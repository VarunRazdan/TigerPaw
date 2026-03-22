import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TradingPolicyState } from "./policy-state.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWriteAuditEntry = vi.fn();
vi.mock("./audit-log.js", () => ({
  writeAuditEntry: mockWriteAuditEntry,
}));

let policyState: TradingPolicyState;
let _capturedMutator: ((s: TradingPolicyState) => TradingPolicyState) | undefined;

const mockLoadPolicyState = vi.fn(async () => policyState);
const mockUpdatePolicyState = vi.fn(async (fn: (s: TradingPolicyState) => TradingPolicyState) => {
  _capturedMutator = fn;
  policyState = fn(policyState);
});

vi.mock("./policy-state.js", () => ({
  loadPolicyState: mockLoadPolicyState,
  updatePolicyState: mockUpdatePolicyState,
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import after mocks are set up.
const { checkKillSwitch, activateKillSwitch, deactivateKillSwitch, autoActivateIfBreached } =
  await import("./kill-switch.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<TradingPolicyState> = {}): TradingPolicyState {
  return {
    killSwitch: { active: false },
    dailyPnlUsd: 0,
    currentPortfolioValueUsd: 100_000,
    highWaterMarkUsd: 100_000,
    consecutiveLosses: 0,
    ...overrides,
  } as TradingPolicyState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("kill-switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMutator = undefined;
    policyState = makeState();
  });

  // -----------------------------------------------------------------------
  // checkKillSwitch
  // -----------------------------------------------------------------------
  describe("checkKillSwitch", () => {
    it("returns inactive status when kill switch is off", async () => {
      policyState = makeState({
        killSwitch: { active: false },
      });

      const status = await checkKillSwitch();

      expect(mockLoadPolicyState).toHaveBeenCalledOnce();
      expect(status).toEqual({
        active: false,
        mode: "hard",
        activatedAt: undefined,
        activatedBy: undefined,
        reason: undefined,
      });
    });

    it("returns active status with metadata when kill switch is on", async () => {
      policyState = makeState({
        killSwitch: {
          active: true,
          activatedAt: 1700000000000,
          activatedBy: "operator-alice",
          reason: "manual halt",
        },
      });

      const status = await checkKillSwitch();

      expect(status).toEqual({
        active: true,
        mode: "hard",
        activatedAt: 1700000000000,
        activatedBy: "operator-alice",
        reason: "manual halt",
      });
    });
  });

  // -----------------------------------------------------------------------
  // activateKillSwitch
  // -----------------------------------------------------------------------
  describe("activateKillSwitch", () => {
    it("updates policy state with active=true, timestamp, actor, and reason", async () => {
      const before = Date.now();
      await activateKillSwitch("risk limit breached", "operator");
      const after = Date.now();

      expect(mockUpdatePolicyState).toHaveBeenCalledOnce();

      // Verify the mutated state.
      expect(policyState.killSwitch.active).toBe(true);
      expect(policyState.killSwitch.activatedAt).toBeGreaterThanOrEqual(before);
      expect(policyState.killSwitch.activatedAt).toBeLessThanOrEqual(after);
      expect(policyState.killSwitch.activatedBy).toBe("operator");
      expect(policyState.killSwitch.reason).toBe("risk limit breached");
    });

    it("labels actor as 'system' when actor is 'system'", async () => {
      await activateKillSwitch("auto-halt", "system");

      expect(policyState.killSwitch.activatedBy).toBe("system");
    });

    it("writes an audit entry with action kill_switch_activated", async () => {
      await activateKillSwitch("drawdown exceeded", "operator");

      expect(mockWriteAuditEntry).toHaveBeenCalledOnce();
      expect(mockWriteAuditEntry).toHaveBeenCalledWith({
        extensionId: "system",
        action: "kill_switch_activated",
        actor: "operator",
        error: "drawdown exceeded",
      });
    });
  });

  // -----------------------------------------------------------------------
  // deactivateKillSwitch
  // -----------------------------------------------------------------------
  describe("deactivateKillSwitch", () => {
    it("updates policy state with active=false", async () => {
      policyState = makeState({
        killSwitch: {
          active: true,
          activatedAt: 1700000000000,
          activatedBy: "system",
          reason: "loss limit",
        },
      });

      await deactivateKillSwitch("operator");

      expect(mockUpdatePolicyState).toHaveBeenCalledOnce();
      expect(policyState.killSwitch).toEqual({ active: false });
    });

    it("writes an audit entry with action policy_changed", async () => {
      await deactivateKillSwitch("operator");

      expect(mockWriteAuditEntry).toHaveBeenCalledOnce();
      expect(mockWriteAuditEntry).toHaveBeenCalledWith({
        extensionId: "system",
        action: "policy_changed",
        actor: "operator",
      });
    });
  });

  // -----------------------------------------------------------------------
  // autoActivateIfBreached
  // -----------------------------------------------------------------------
  describe("autoActivateIfBreached", () => {
    const defaultLimits = {
      dailyLossLimitPercent: 5,
      maxPortfolioDrawdownPercent: 10,
      consecutiveLossPause: 3,
    };

    it("returns false when no limits are breached", async () => {
      const state = makeState({
        dailyPnlUsd: -1000, // 1% loss on 100k portfolio -- under 5% limit
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 1,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(false);
      expect(mockUpdatePolicyState).not.toHaveBeenCalled();
      expect(mockWriteAuditEntry).not.toHaveBeenCalled();
    });

    it("activates when daily loss percent breaches limit", async () => {
      const state = makeState({
        dailyPnlUsd: -6000, // 6% loss on 100k -- breaches 5% limit
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 0,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(true);
      expect(mockUpdatePolicyState).toHaveBeenCalledOnce();
      expect(policyState.killSwitch.active).toBe(true);
      expect(policyState.killSwitch.reason).toContain("daily loss limit breached");
      expect(policyState.killSwitch.activatedBy).toBe("system");
    });

    it("activates when daily loss percent equals limit exactly", async () => {
      const state = makeState({
        dailyPnlUsd: -5000, // exactly 5% on 100k
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 0,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(true);
      expect(policyState.killSwitch.reason).toContain("daily loss limit breached");
    });

    it("activates when portfolio drawdown breaches limit", async () => {
      const state = makeState({
        dailyPnlUsd: 0,
        currentPortfolioValueUsd: 88_000, // 12% drawdown from 100k HWM -- breaches 10%
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 0,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(true);
      expect(policyState.killSwitch.reason).toContain("portfolio drawdown breached");
    });

    it("activates when drawdown percent equals limit exactly", async () => {
      const state = makeState({
        dailyPnlUsd: 0,
        currentPortfolioValueUsd: 90_000, // exactly 10% drawdown
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 0,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(true);
      expect(policyState.killSwitch.reason).toContain("portfolio drawdown breached");
    });

    it("activates when consecutive losses breach limit", async () => {
      const state = makeState({
        dailyPnlUsd: 0,
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 5, // breaches pause threshold of 3
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(true);
      expect(policyState.killSwitch.reason).toContain("consecutive loss pause triggered");
    });

    it("activates when consecutive losses equal limit exactly", async () => {
      const state = makeState({
        dailyPnlUsd: 0,
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 3, // exactly at pause threshold
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(true);
      expect(policyState.killSwitch.reason).toContain("consecutive loss pause triggered");
    });

    it("checks daily loss before drawdown (short-circuits on first breach)", async () => {
      const state = makeState({
        dailyPnlUsd: -10_000, // 10% loss -- breaches 5% daily limit
        currentPortfolioValueUsd: 80_000, // also a 20% drawdown -- breaches 10%
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 10, // also breaches consecutive loss
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(true);
      // Only one activation should fire (daily loss is checked first).
      expect(mockUpdatePolicyState).toHaveBeenCalledOnce();
      expect(policyState.killSwitch.reason).toContain("daily loss limit breached");
    });

    it("skips daily loss check when portfolio value is zero", async () => {
      const state = makeState({
        dailyPnlUsd: -500,
        currentPortfolioValueUsd: 0, // guards against division by zero
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 0,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      // No daily-loss breach (skipped), no drawdown breach (0/100k = 100% but
      // currentPortfolioValueUsd=0 means drawdown = 100% which exceeds 10%).
      // Actually drawdown = (100k - 0)/100k = 100% >= 10%, so it activates via drawdown.
      expect(result).toBe(true);
      expect(policyState.killSwitch.reason).toContain("portfolio drawdown breached");
    });

    it("skips drawdown check when high water mark is zero", async () => {
      const state = makeState({
        dailyPnlUsd: 0,
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 0, // guards against division by zero
        consecutiveLosses: 0,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(false);
    });

    it("does not activate for positive daily PnL", async () => {
      const state = makeState({
        dailyPnlUsd: 5000, // positive -- no loss
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 0,
      });

      const result = await autoActivateIfBreached(state, defaultLimits);

      expect(result).toBe(false);
    });
  });
});
