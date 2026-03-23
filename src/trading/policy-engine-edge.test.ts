import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  TradingPolicyEngine,
  RISK_TIER_PRESETS,
  type TradingPolicyConfig,
  type TradeOrder,
} from "./policy-engine.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

vi.mock("./kill-switch.js", () => ({
  checkKillSwitch: vi.fn(async () => ({ active: false, mode: "hard" })),
  isOrderAllowedUnderKillSwitch: vi.fn(() => true),
  autoActivateIfBreached: vi.fn(async () => false),
}));

let mockState = defaultPolicyState();

function defaultPolicyState() {
  return {
    date: new Date().toISOString().slice(0, 10),
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    highWaterMarkUsd: 10_000,
    currentPortfolioValueUsd: 10_000,
    openPositionCount: 0,
    positionCountByPlatform: {},
    portfolioByPlatform: {},
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
    platformKillSwitches: {},
  };
}

vi.mock("./policy-state.js", () => ({
  loadPolicyState: vi.fn(async () => mockState),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrder(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return {
    id: "edge-test-order",
    extensionId: "alpaca",
    symbol: "AAPL",
    side: "buy",
    quantity: 1,
    priceUsd: 10,
    notionalUsd: 10,
    orderType: "market",
    ...overrides,
  };
}

function makeConservativeAutoConfig(): TradingPolicyConfig {
  return {
    ...RISK_TIER_PRESETS.conservative,
    approvalMode: "auto",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TradingPolicyEngine edge cases", () => {
  beforeEach(() => {
    mockState = defaultPolicyState();
    vi.clearAllMocks();
  });

  it("denies buy orders with zero notionalUsd", async () => {
    const engine = new TradingPolicyEngine(makeConservativeAutoConfig());
    const decision = await engine.evaluateOrder(
      makeOrder({ side: "buy", notionalUsd: 0, priceUsd: 0 }),
    );

    expect(decision.outcome).toBe("denied");
    expect(decision.failedStep).toBe("numeric_sanity");
    expect(decision.reason).toContain("non-zero notional");
  });

  it("allows sell orders with zero notionalUsd", async () => {
    const engine = new TradingPolicyEngine(makeConservativeAutoConfig());
    const decision = await engine.evaluateOrder(
      makeOrder({ side: "sell", notionalUsd: 0, priceUsd: 0 }),
    );

    expect(decision.outcome).toBe("approved");
  });

  it("denies orders with NaN notionalUsd", async () => {
    const engine = new TradingPolicyEngine(makeConservativeAutoConfig());
    const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: NaN }));

    expect(decision.outcome).toBe("denied");
    expect(decision.failedStep).toBe("numeric_sanity");
    expect(decision.reason).toContain("invalid notional");
  });

  it("denies orders with negative notionalUsd", async () => {
    const engine = new TradingPolicyEngine(makeConservativeAutoConfig());
    const decision = await engine.evaluateOrder(makeOrder({ notionalUsd: -100 }));

    expect(decision.outcome).toBe("denied");
    expect(decision.failedStep).toBe("numeric_sanity");
    expect(decision.reason).toContain("invalid notional");
  });
});
