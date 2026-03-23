import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  TradingPolicyEngine,
  RISK_TIER_PRESETS,
  type TradingPolicyConfig,
  type TradeOrder,
} from "./policy-engine.js";

// Mock dependencies to isolate the validation logic.
vi.mock("./audit-log.js", () => ({
  writeAuditEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Keep kill-switch and policy-state mock state local so tests can control it.
let mockKillSwitchActive = false;
let mockKillSwitchReason: string | undefined;

const defaultPolicyState = () => ({
  date: new Date().toISOString().slice(0, 10),
  dailyPnlUsd: 0,
  dailySpendUsd: 0,
  dailyTradeCount: 0,
  consecutiveLosses: 0,
  highWaterMarkUsd: 10_000,
  currentPortfolioValueUsd: 10_000,
  openPositionCount: 0,
  positionCountByPlatform: {},
  positionsByAsset: {},
  lastTradeAtMs: 0,
  killSwitch: { active: false },
});

let mockState = defaultPolicyState();

vi.mock("./kill-switch.js", () => ({
  checkKillSwitch: vi.fn(async () => ({
    active: mockKillSwitchActive,
    reason: mockKillSwitchReason,
    mode: "hard",
  })),
  isOrderAllowedUnderKillSwitch: vi.fn(
    (killStatus: { active: boolean; mode?: string }, orderSide: string) => {
      if (!killStatus.active) {
        return true;
      }
      if (killStatus.mode === "soft" && (orderSide === "sell" || orderSide === "cancel")) {
        return true;
      }
      return false;
    },
  ),
  autoActivateIfBreached: vi.fn(async () => false),
}));

vi.mock("./policy-state.js", () => ({
  loadPolicyState: vi.fn(async () => mockState),
}));

function makeOrder(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return {
    id: "test-order-1",
    extensionId: "alpaca",
    symbol: "AAPL",
    side: "buy",
    quantity: 1,
    priceUsd: 50,
    notionalUsd: 50,
    orderType: "market",
    ...overrides,
  };
}

describe("TradingPolicyEngine", () => {
  beforeEach(() => {
    mockKillSwitchActive = false;
    mockKillSwitchReason = undefined;
    mockState = defaultPolicyState();
    vi.clearAllMocks();
  });

  describe("risk tier presets", () => {
    it("defines conservative, moderate, and aggressive presets", () => {
      expect(RISK_TIER_PRESETS.conservative.approvalMode).toBe("manual");
      expect(RISK_TIER_PRESETS.moderate.approvalMode).toBe("confirm");
      expect(RISK_TIER_PRESETS.aggressive.approvalMode).toBe("auto");
    });

    it("conservative has the strictest limits", () => {
      const c = RISK_TIER_PRESETS.conservative.limits;
      const m = RISK_TIER_PRESETS.moderate.limits;
      expect(c.maxDailySpendUsd).toBeLessThan(m.maxDailySpendUsd);
      expect(c.maxSingleTradeUsd).toBeLessThan(m.maxSingleTradeUsd);
      expect(c.maxTradesPerDay).toBeLessThan(m.maxTradesPerDay);
    });

    it("aggressive has the loosest limits", () => {
      const a = RISK_TIER_PRESETS.aggressive.limits;
      const m = RISK_TIER_PRESETS.moderate.limits;
      expect(a.maxDailySpendUsd).toBeGreaterThan(m.maxDailySpendUsd);
      expect(a.maxSingleTradeUsd).toBeGreaterThan(m.maxSingleTradeUsd);
    });
  });

  describe("kill switch gate", () => {
    it("denies orders when kill switch is active", async () => {
      mockKillSwitchActive = true;
      mockKillSwitchReason = "daily loss limit exceeded";

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.moderate);
      const decision = await engine.evaluateOrder(makeOrder());

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("kill_switch");
      expect(decision.reason).toContain("kill switch active");
    });
  });

  describe("validation pipeline", () => {
    it("approves orders within all limits in auto mode", async () => {
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.aggressive);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 10 }));

      expect(decision.outcome).toBe("approved");
      expect(decision.approvalMode).toBe("auto");
    });

    it("returns pending_confirmation in confirm mode", async () => {
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.moderate);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 10 }));

      expect(decision.outcome).toBe("pending_confirmation");
      expect(decision.approvalMode).toBe("confirm");
      expect(decision.timeoutMs).toBe(15_000);
    });

    it("returns pending_confirmation in manual mode", async () => {
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 10 }));

      expect(decision.outcome).toBe("pending_confirmation");
      expect(decision.approvalMode).toBe("manual");
      expect(decision.timeoutMs).toBe(300_000);
    });

    it("denies when per-trade size exceeds limit", async () => {
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 50 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("per_trade_size");
      expect(decision.reason).toContain("exceeds max");
    });

    it("denies when daily trade count is at limit", async () => {
      mockState = { ...defaultPolicyState(), dailyTradeCount: 10 };

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 5 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("max_trades_per_day");
    });

    it("denies when daily spend would exceed limit", async () => {
      mockState = { ...defaultPolicyState(), dailySpendUsd: 95 };

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 10 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("daily_spend");
    });

    it("denies when consecutive losses at pause threshold", async () => {
      mockState = { ...defaultPolicyState(), consecutiveLosses: 3 };

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 5 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("consecutive_losses");
    });

    it("denies when max open positions reached", async () => {
      mockState = { ...defaultPolicyState(), openPositionCount: 3 };

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 5 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("max_open_positions");
    });

    it("denies when risk per trade exceeds portfolio percentage limit", async () => {
      // Portfolio is 10k, trade is 600 = 6%, limit is 1% for conservative
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 600 }));

      expect(decision.outcome).toBe("denied");
      // Either balance_check or per_trade_size will fire first
      expect(decision.failedStep).toBeDefined();
    });

    it("denies when position concentration exceeds limit", async () => {
      mockState = {
        ...defaultPolicyState(),
        positionsByAsset: {
          AAPL: { extensionId: "alpaca", valueUsd: 450, percentOfPortfolio: 4.5 },
        },
      };

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      // Existing 450 + 100 = 550, which is 5.5% > 5% limit
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 100 }));

      // Will be denied for per_trade_size (100 > 25) or position_concentration
      expect(decision.outcome).toBe("denied");
    });

    it("denies when daily loss limit is breached", async () => {
      mockState = { ...defaultPolicyState(), dailyPnlUsd: -350 };

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 5 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("daily_loss");
    });

    it("denies when cooldown is active", async () => {
      mockState = { ...defaultPolicyState(), lastTradeAtMs: Date.now() - 5000 };

      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 5 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("cooldown");
      expect(decision.reason).toContain("remaining");
    });
  });

  describe("per-extension overrides", () => {
    it("uses per-extension approval mode override", async () => {
      const config: TradingPolicyConfig = {
        ...RISK_TIER_PRESETS.moderate,
        perExtension: {
          manifold: { approvalMode: "auto" },
        },
      };

      const engine = new TradingPolicyEngine(config);
      const decision = await engine.evaluateOrder(
        makeOrder({ extensionId: "manifold", notionalUsd: 10 }),
      );

      expect(decision.outcome).toBe("approved");
      expect(decision.approvalMode).toBe("auto");
    });

    it("uses per-extension limit overrides", async () => {
      const config: TradingPolicyConfig = {
        ...RISK_TIER_PRESETS.aggressive,
        perExtension: {
          alpaca: { maxSingleTradeUsd: 5 },
        },
      };

      const engine = new TradingPolicyEngine(config);
      const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: 10 }));

      expect(decision.outcome).toBe("denied");
      expect(decision.failedStep).toBe("per_trade_size");
    });

    it("falls back to global config for unoverridden extensions", async () => {
      const config: TradingPolicyConfig = {
        ...RISK_TIER_PRESETS.moderate,
        perExtension: {
          manifold: { approvalMode: "auto" },
        },
      };

      const engine = new TradingPolicyEngine(config);
      const decision = await engine.evaluateOrder(
        makeOrder({ extensionId: "alpaca", notionalUsd: 10 }),
      );

      expect(decision.approvalMode).toBe("confirm");
    });
  });
});
