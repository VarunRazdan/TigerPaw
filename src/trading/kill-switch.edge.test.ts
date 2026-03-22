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

const mockLoadPolicyState = vi.fn(async () => policyState);
const mockUpdatePolicyState = vi.fn(async (fn: (s: TradingPolicyState) => TradingPolicyState) => {
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

const {
  checkKillSwitch,
  activateKillSwitch,
  deactivateKillSwitch,
  autoActivateIfBreached,
  isOrderAllowedUnderKillSwitch,
} = await import("./kill-switch.js");

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

describe("kill-switch edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyState = makeState();
  });

  // -----------------------------------------------------------------------
  // isOrderAllowedUnderKillSwitch
  // -----------------------------------------------------------------------
  describe("isOrderAllowedUnderKillSwitch", () => {
    it("allows all orders when kill switch is inactive", () => {
      const status = { active: false, mode: "hard" as const };
      expect(isOrderAllowedUnderKillSwitch(status, "buy")).toBe(true);
      expect(isOrderAllowedUnderKillSwitch(status, "sell")).toBe(true);
      expect(isOrderAllowedUnderKillSwitch(status, "cancel")).toBe(true);
    });

    it("blocks all orders in hard mode", () => {
      const status = { active: true, mode: "hard" as const };
      expect(isOrderAllowedUnderKillSwitch(status, "buy")).toBe(false);
      expect(isOrderAllowedUnderKillSwitch(status, "sell")).toBe(false);
      expect(isOrderAllowedUnderKillSwitch(status, "cancel")).toBe(false);
    });

    it("blocks buys but allows sells in soft mode", () => {
      const status = { active: true, mode: "soft" as const };
      expect(isOrderAllowedUnderKillSwitch(status, "buy")).toBe(false);
      expect(isOrderAllowedUnderKillSwitch(status, "sell")).toBe(true);
      expect(isOrderAllowedUnderKillSwitch(status, "cancel")).toBe(true);
    });

    it("treats missing mode as hard", () => {
      const status = { active: true };
      expect(isOrderAllowedUnderKillSwitch(status, "buy")).toBe(false);
      expect(isOrderAllowedUnderKillSwitch(status, "sell")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // activateKillSwitch with modes
  // -----------------------------------------------------------------------
  describe("activateKillSwitch modes", () => {
    it("defaults to hard mode when not specified", async () => {
      await activateKillSwitch("test reason", "operator");
      expect(policyState.killSwitch.active).toBe(true);
      expect((policyState.killSwitch as { mode?: string }).mode).toBe("hard");
    });

    it("stores soft mode when specified", async () => {
      await activateKillSwitch("soft halt", "operator", "soft");
      expect(policyState.killSwitch.active).toBe(true);
      expect((policyState.killSwitch as { mode?: string }).mode).toBe("soft");
    });

    it("stores hard mode when explicitly specified", async () => {
      await activateKillSwitch("hard halt", "system", "hard");
      expect((policyState.killSwitch as { mode?: string }).mode).toBe("hard");
    });
  });

  // -----------------------------------------------------------------------
  // checkKillSwitch mode handling
  // -----------------------------------------------------------------------
  describe("checkKillSwitch mode", () => {
    it("returns hard when kill switch state has no mode field", async () => {
      policyState = makeState({
        killSwitch: { active: true, activatedAt: 1700000000000, activatedBy: "operator" },
      });
      const status = await checkKillSwitch();
      expect(status.mode).toBe("hard");
    });

    it("returns the stored mode", async () => {
      await activateKillSwitch("reason", "operator", "soft");
      const status = await checkKillSwitch();
      expect(status.mode).toBe("soft");
    });
  });

  // -----------------------------------------------------------------------
  // autoActivateIfBreached boundary conditions
  // -----------------------------------------------------------------------
  describe("autoActivateIfBreached boundaries", () => {
    const limits = {
      dailyLossLimitPercent: 5,
      maxPortfolioDrawdownPercent: 10,
      consecutiveLossPause: 3,
    };

    it("does NOT activate when daily loss is just under the limit", async () => {
      // 4.99% loss on 100k = -4990
      const state = makeState({
        dailyPnlUsd: -4990,
        currentPortfolioValueUsd: 100_000,
      });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(false);
    });

    it("activates when daily loss exactly equals the limit", async () => {
      // 5% loss on 100k = -5000
      const state = makeState({
        dailyPnlUsd: -5000,
        currentPortfolioValueUsd: 100_000,
      });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(true);
    });

    it("does NOT activate when drawdown is just under the limit", async () => {
      // 9.99% drawdown from 100k = 90,010
      const state = makeState({
        currentPortfolioValueUsd: 90_010,
        highWaterMarkUsd: 100_000,
      });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(false);
    });

    it("activates when drawdown exactly equals the limit", async () => {
      // 10% drawdown from 100k = 90,000
      const state = makeState({
        currentPortfolioValueUsd: 90_000,
        highWaterMarkUsd: 100_000,
      });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(true);
    });

    it("does NOT activate when consecutive losses are just under the pause", async () => {
      const state = makeState({ consecutiveLosses: 2 });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(false);
    });

    it("activates when consecutive losses exactly equal the pause", async () => {
      const state = makeState({ consecutiveLosses: 3 });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(true);
    });

    it("handles positive daily PnL (no loss)", async () => {
      const state = makeState({ dailyPnlUsd: 5000 });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(false);
    });

    it("handles zero portfolio value without division by zero", async () => {
      const state = makeState({
        dailyPnlUsd: -1000,
        currentPortfolioValueUsd: 0,
        highWaterMarkUsd: 100_000,
      });
      // Should skip daily loss check (div by zero guard) but catch drawdown (100%)
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(true);
    });

    it("handles zero high water mark without division by zero", async () => {
      const state = makeState({
        currentPortfolioValueUsd: 100_000,
        highWaterMarkUsd: 0,
      });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(false);
    });

    it("handles negative portfolio value (edge case)", async () => {
      const state = makeState({
        dailyPnlUsd: -500,
        currentPortfolioValueUsd: -1000,
        highWaterMarkUsd: 100_000,
      });
      // Negative portfolio: daily loss check skipped (<=0), drawdown > 100%
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(true);
    });

    it("checks daily loss before drawdown (short-circuit)", async () => {
      const state = makeState({
        dailyPnlUsd: -10_000,
        currentPortfolioValueUsd: 80_000,
        highWaterMarkUsd: 100_000,
        consecutiveLosses: 10,
      });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(true);
      // Only one activation
      expect(mockUpdatePolicyState).toHaveBeenCalledOnce();
      expect(policyState.killSwitch.reason).toContain("daily loss limit breached");
    });

    it("handles very small fractional losses near boundary", async () => {
      // Exactly 4.999% loss: -4999 / 100000 * 100 = 4.999%
      const state = makeState({
        dailyPnlUsd: -4999,
        currentPortfolioValueUsd: 100_000,
      });
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(false);
    });

    it("handles very large portfolio values", async () => {
      const state = makeState({
        dailyPnlUsd: -5_000_000,
        currentPortfolioValueUsd: 100_000_000,
        highWaterMarkUsd: 100_000_000,
      });
      // 5% loss
      const result = await autoActivateIfBreached(state, limits);
      expect(result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // deactivateKillSwitch
  // -----------------------------------------------------------------------
  describe("deactivateKillSwitch clears all fields", () => {
    it("clears mode, reason, activatedAt, and activatedBy", async () => {
      await activateKillSwitch("test reason", "operator", "soft");
      expect(policyState.killSwitch.active).toBe(true);

      await deactivateKillSwitch("operator");
      expect(policyState.killSwitch).toEqual({ active: false });
      expect((policyState.killSwitch as { mode?: string }).mode).toBeUndefined();
      expect(policyState.killSwitch.reason).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Activate/deactivate cycle
  // -----------------------------------------------------------------------
  describe("activate/deactivate cycle", () => {
    it("can be toggled multiple times", async () => {
      await activateKillSwitch("first", "operator");
      expect(policyState.killSwitch.active).toBe(true);

      await deactivateKillSwitch("operator");
      expect(policyState.killSwitch.active).toBe(false);

      await activateKillSwitch("second", "system", "soft");
      expect(policyState.killSwitch.active).toBe(true);
      expect((policyState.killSwitch as { mode?: string }).mode).toBe("soft");

      await deactivateKillSwitch("operator");
      expect(policyState.killSwitch.active).toBe(false);
    });
  });
});
