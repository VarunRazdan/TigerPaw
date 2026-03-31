import fc from "fast-check";
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

vi.mock("./event-emitter.js", () => ({
  emitTradingEvent: vi.fn(),
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
// Helpers
// ---------------------------------------------------------------------------

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

function _makeFill(overrides: Partial<FillRecord> = {}): FillRecord {
  return {
    extensionId: "alpaca",
    symbol: "AAPL",
    side: "buy",
    quantity: 1,
    executedPrice: 100,
    realizedPnl: 0,
    ...overrides,
  };
}

/** Arbitrary for a FillRecord with reasonable numeric ranges. */
const arbFill: fc.Arbitrary<FillRecord> = fc.record({
  extensionId: fc.constantFrom("alpaca", "kalshi", "polymarket"),
  symbol: fc.constantFrom("AAPL", "BTC", "ETH", "TSLA"),
  side: fc.constantFrom("buy" as const, "sell" as const),
  quantity: fc.double({ min: 0.001, max: 10_000, noNaN: true }),
  executedPrice: fc.double({ min: 0.01, max: 100_000, noNaN: true }),
  realizedPnl: fc.double({ min: -50_000, max: 50_000, noNaN: true }),
  orderId: fc.option(fc.uuid(), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe("recordTradeFill — property-based tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dailyPnlUsd equals sum of all realizedPnl values", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbFill, { minLength: 1, maxLength: 20 }), async (fills) => {
        policyState = makeState({ dailyPnlUsd: 0 });
        let expectedPnl = 0;

        for (const fill of fills) {
          await recordTradeFill(fill);
          expectedPnl += fill.realizedPnl;
        }

        expect(policyState.dailyPnlUsd).toBeCloseTo(expectedPnl, 6);
      }),
      { numRuns: 100 },
    );
  });

  it("consecutiveLosses is always non-negative", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbFill, { minLength: 1, maxLength: 30 }), async (fills) => {
        policyState = makeState({ consecutiveLosses: 0 });

        for (const fill of fills) {
          await recordTradeFill(fill);
          expect(policyState.consecutiveLosses).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("consecutiveLosses never exceeds number of negative fills", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbFill, { minLength: 1, maxLength: 30 }), async (fills) => {
        policyState = makeState({ consecutiveLosses: 0 });
        let negativeCount = 0;

        for (const fill of fills) {
          if (fill.realizedPnl < 0) {
            negativeCount++;
          }
          await recordTradeFill(fill);
        }

        expect(policyState.consecutiveLosses).toBeLessThanOrEqual(negativeCount);
      }),
      { numRuns: 100 },
    );
  });

  it("highWaterMarkUsd is monotonically non-decreasing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbFill, { minLength: 1, maxLength: 20 }), async (fills) => {
        policyState = makeState({ highWaterMarkUsd: 100_000 });
        let previousHwm = policyState.highWaterMarkUsd;

        for (const fill of fills) {
          await recordTradeFill(fill);
          expect(policyState.highWaterMarkUsd).toBeGreaterThanOrEqual(previousHwm);
          previousHwm = policyState.highWaterMarkUsd;
        }
      }),
      { numRuns: 100 },
    );
  });

  it("dailyTradeCount equals number of fills", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbFill, { minLength: 1, maxLength: 20 }), async (fills) => {
        policyState = makeState({ dailyTradeCount: 0 });

        for (const fill of fills) {
          await recordTradeFill(fill);
        }

        expect(policyState.dailyTradeCount).toBe(fills.length);
      }),
      { numRuns: 100 },
    );
  });

  it("dailySpendUsd only increases on buy fills", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbFill, { minLength: 1, maxLength: 20 }), async (fills) => {
        policyState = makeState({ dailySpendUsd: 0 });

        for (const fill of fills) {
          const before = policyState.dailySpendUsd;
          await recordTradeFill(fill);
          const after = policyState.dailySpendUsd;

          if (fill.side === "sell") {
            expect(after).toBe(before);
          } else {
            // buy: dailySpendUsd changes by notional (quantity * executedPrice)
            const notional = fill.quantity * fill.executedPrice;
            expect(after).toBeCloseTo(before + notional, 6);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
