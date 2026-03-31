import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TradingPolicyState } from "./policy-state.js";
import type { FillRecord } from "./realized-pnl.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let policyState: TradingPolicyState;

const mockUpdatePolicyState = vi.fn(async (fn: (s: TradingPolicyState) => TradingPolicyState) => {
  policyState = fn(policyState);
  return policyState;
});

vi.mock("./policy-state.js", () => ({
  updatePolicyState: (...args: unknown[]) => mockUpdatePolicyState(...args),
}));

const mockEmitTradingEvent = vi.fn();
vi.mock("./event-emitter.js", () => ({
  emitTradingEvent: (...args: unknown[]) => mockEmitTradingEvent(...args),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const { recordTradeFill } = await import("./realized-pnl.js");

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeFill(overrides: Partial<FillRecord> = {}): FillRecord {
  return {
    extensionId: "alpaca",
    symbol: "AAPL",
    side: "buy",
    quantity: 10,
    executedPrice: 150,
    realizedPnl: 0,
    orderId: "order-1",
    ...overrides,
  };
}

function makeState(overrides: Partial<TradingPolicyState> = {}): TradingPolicyState {
  return {
    date: new Date().toISOString().slice(0, 10),
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    highWaterMarkUsd: 100_000,
    currentPortfolioValueUsd: 100_000,
    openPositionCount: 0,
    positionCountByPlatform: {},
    portfolioByPlatform: {},
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
    platformKillSwitches: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recordTradeFill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyState = makeState();
  });

  // -------------------------------------------------------------------------
  // State mutation — dailyPnlUsd
  // -------------------------------------------------------------------------
  describe("state mutation — dailyPnlUsd", () => {
    it("adds positive realizedPnl to dailyPnlUsd", async () => {
      policyState = makeState({ dailyPnlUsd: 50 });
      const result = await recordTradeFill(makeFill({ realizedPnl: 25 }));
      expect(result.dailyPnlUsd).toBe(75);
    });

    it("subtracts negative realizedPnl from dailyPnlUsd", async () => {
      policyState = makeState({ dailyPnlUsd: 100 });
      const result = await recordTradeFill(makeFill({ realizedPnl: -30 }));
      expect(result.dailyPnlUsd).toBe(70);
    });

    it("leaves dailyPnlUsd unchanged on zero realizedPnl", async () => {
      policyState = makeState({ dailyPnlUsd: 42 });
      const result = await recordTradeFill(makeFill({ realizedPnl: 0 }));
      expect(result.dailyPnlUsd).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // State mutation — dailyTradeCount
  // -------------------------------------------------------------------------
  describe("state mutation — dailyTradeCount", () => {
    it("increments dailyTradeCount by 1", async () => {
      policyState = makeState({ dailyTradeCount: 7 });
      const result = await recordTradeFill(makeFill());
      expect(result.dailyTradeCount).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // State mutation — consecutiveLosses
  // -------------------------------------------------------------------------
  describe("state mutation — consecutiveLosses", () => {
    it("increments on negative realizedPnl", async () => {
      policyState = makeState({ consecutiveLosses: 2 });
      const result = await recordTradeFill(makeFill({ realizedPnl: -10 }));
      expect(result.consecutiveLosses).toBe(3);
    });

    it("resets to zero on positive realizedPnl", async () => {
      policyState = makeState({ consecutiveLosses: 5 });
      const result = await recordTradeFill(makeFill({ realizedPnl: 10 }));
      expect(result.consecutiveLosses).toBe(0);
    });

    it("stays unchanged on zero realizedPnl", async () => {
      policyState = makeState({ consecutiveLosses: 3 });
      const result = await recordTradeFill(makeFill({ realizedPnl: 0 }));
      expect(result.consecutiveLosses).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // State mutation — dailySpendUsd
  // -------------------------------------------------------------------------
  describe("state mutation — dailySpendUsd", () => {
    it("adds notional to dailySpendUsd on buy", async () => {
      policyState = makeState({ dailySpendUsd: 500 });
      const result = await recordTradeFill(
        makeFill({ side: "buy", quantity: 5, executedPrice: 200 }),
      );
      // notional = 5 * 200 = 1000
      expect(result.dailySpendUsd).toBe(1500);
    });

    it("does not add to dailySpendUsd on sell", async () => {
      policyState = makeState({ dailySpendUsd: 500 });
      const result = await recordTradeFill(
        makeFill({ side: "sell", quantity: 5, executedPrice: 200 }),
      );
      expect(result.dailySpendUsd).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // State mutation — highWaterMarkUsd
  // -------------------------------------------------------------------------
  describe("state mutation — highWaterMarkUsd", () => {
    it("updates HWM when portfolio + pnl exceeds current HWM", async () => {
      policyState = makeState({
        highWaterMarkUsd: 100_000,
        currentPortfolioValueUsd: 99_000,
      });
      // portfolio (99000) + realizedPnl (2000) = 101000 > HWM (100000)
      const result = await recordTradeFill(makeFill({ realizedPnl: 2_000 }));
      expect(result.highWaterMarkUsd).toBe(101_000);
    });

    it("keeps HWM unchanged when portfolio + pnl is below HWM", async () => {
      policyState = makeState({
        highWaterMarkUsd: 120_000,
        currentPortfolioValueUsd: 100_000,
      });
      const result = await recordTradeFill(makeFill({ realizedPnl: 5_000 }));
      // portfolio (100000) + pnl (5000) = 105000 < HWM (120000)
      expect(result.highWaterMarkUsd).toBe(120_000);
    });
  });

  // -------------------------------------------------------------------------
  // State mutation — lastTradeAtMs
  // -------------------------------------------------------------------------
  describe("state mutation — lastTradeAtMs", () => {
    it("sets lastTradeAtMs to current time", async () => {
      const before = Date.now();
      const result = await recordTradeFill(makeFill());
      const after = Date.now();
      expect(result.lastTradeAtMs).toBeGreaterThanOrEqual(before);
      expect(result.lastTradeAtMs).toBeLessThanOrEqual(after);
    });
  });

  // -------------------------------------------------------------------------
  // Event emission
  // -------------------------------------------------------------------------
  describe("event emission", () => {
    it("emits trading.order.filled event with correct payload fields", async () => {
      await recordTradeFill(
        makeFill({
          extensionId: "kalshi",
          symbol: "BTC",
          side: "sell",
          quantity: 2,
          executedPrice: 50_000,
          realizedPnl: 1_000,
          orderId: "ord-abc",
        }),
      );

      expect(mockEmitTradingEvent).toHaveBeenCalledTimes(1);
      const event = mockEmitTradingEvent.mock.calls[0][0];
      expect(event.type).toBe("trading.order.filled");
      expect(typeof event.timestamp).toBe("number");
      expect(event.payload.extensionId).toBe("kalshi");
      expect(event.payload.symbol).toBe("BTC");
      expect(event.payload.side).toBe("sell");
      expect(event.payload.notionalUsd).toBe(100_000); // 2 * 50000
      expect(event.payload.quantity).toBe(2);
      expect(event.payload.executedPrice).toBe(50_000);
      expect(event.payload.realizedPnl).toBe(1_000);
    });

    it("propagates orderId in event payload", async () => {
      await recordTradeFill(makeFill({ orderId: "my-order-123" }));

      const event = mockEmitTradingEvent.mock.calls[0][0];
      expect(event.payload.orderId).toBe("my-order-123");
    });

    it("handles undefined orderId gracefully", async () => {
      await recordTradeFill(makeFill({ orderId: undefined }));

      const event = mockEmitTradingEvent.mock.calls[0][0];
      expect(event.payload.orderId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    it("handles zero quantity", async () => {
      const result = await recordTradeFill(makeFill({ quantity: 0, executedPrice: 100 }));
      // notional = 0 * 100 = 0, so dailySpend shouldn't increase meaningfully
      expect(result.dailySpendUsd).toBe(0);
      expect(result.dailyTradeCount).toBe(1);
    });

    it("handles zero price", async () => {
      const result = await recordTradeFill(makeFill({ quantity: 10, executedPrice: 0 }));
      // notional = 10 * 0 = 0
      expect(result.dailySpendUsd).toBe(0);
      expect(result.dailyTradeCount).toBe(1);
    });

    it("handles very large values without overflow", async () => {
      policyState = makeState({
        dailyPnlUsd: 1e12,
        currentPortfolioValueUsd: 1e12,
        highWaterMarkUsd: 1e12,
      });
      const result = await recordTradeFill(makeFill({ realizedPnl: 1e12 }));
      expect(result.dailyPnlUsd).toBe(2e12);
      expect(Number.isFinite(result.dailyPnlUsd)).toBe(true);
    });

    it("handles very small fractional values", async () => {
      policyState = makeState({ dailyPnlUsd: 0.000001 });
      const result = await recordTradeFill(makeFill({ realizedPnl: 0.000002 }));
      expect(result.dailyPnlUsd).toBeCloseTo(0.000003, 10);
    });

    it("handles negative executedPrice", async () => {
      // While unusual, the function does not reject negative prices
      const result = await recordTradeFill(
        makeFill({ side: "buy", quantity: 5, executedPrice: -10, realizedPnl: 0 }),
      );
      // notional = 5 * -10 = -50; dailySpend = 0 + (-50) = -50
      expect(result.dailySpendUsd).toBe(-50);
    });
  });

  // -------------------------------------------------------------------------
  // Consecutive loss sequences
  // -------------------------------------------------------------------------
  describe("consecutive loss sequences", () => {
    it("counts consecutive losses across multiple fills", async () => {
      policyState = makeState({ consecutiveLosses: 0 });

      await recordTradeFill(makeFill({ realizedPnl: -10 }));
      expect(policyState.consecutiveLosses).toBe(1);

      await recordTradeFill(makeFill({ realizedPnl: -5 }));
      expect(policyState.consecutiveLosses).toBe(2);

      await recordTradeFill(makeFill({ realizedPnl: -1 }));
      expect(policyState.consecutiveLosses).toBe(3);
    });

    it("resets consecutive losses on a winning trade after losses", async () => {
      policyState = makeState({ consecutiveLosses: 0 });

      await recordTradeFill(makeFill({ realizedPnl: -10 }));
      await recordTradeFill(makeFill({ realizedPnl: -20 }));
      expect(policyState.consecutiveLosses).toBe(2);

      await recordTradeFill(makeFill({ realizedPnl: 5 }));
      expect(policyState.consecutiveLosses).toBe(0);
    });

    it("does not change consecutive losses on break-even trades", async () => {
      policyState = makeState({ consecutiveLosses: 4 });

      await recordTradeFill(makeFill({ realizedPnl: 0 }));
      expect(policyState.consecutiveLosses).toBe(4);

      await recordTradeFill(makeFill({ realizedPnl: 0 }));
      expect(policyState.consecutiveLosses).toBe(4);
    });
  });
});
