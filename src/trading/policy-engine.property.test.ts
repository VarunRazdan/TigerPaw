import fc from "fast-check";
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

let mockKillSwitchActive = false;
let mockKillSwitchMode: "hard" | "soft" = "hard";

const defaultPolicyState = () => ({
  date: new Date().toISOString().slice(0, 10),
  dailyPnlUsd: 0,
  dailySpendUsd: 0,
  dailyTradeCount: 0,
  consecutiveLosses: 0,
  highWaterMarkUsd: 100_000,
  currentPortfolioValueUsd: 100_000,
  openPositionCount: 0,
  positionsByAsset: {} as Record<
    string,
    { extensionId: string; valueUsd: number; percentOfPortfolio: number }
  >,
  lastTradeAtMs: 0,
  killSwitch: { active: false },
});

let mockState = defaultPolicyState();

vi.mock("./kill-switch.js", () => ({
  checkKillSwitch: vi.fn(async () => ({
    active: mockKillSwitchActive,
    mode: mockKillSwitchMode,
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

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid TradeOrder with properties in reasonable ranges. */
const arbTradeOrder = (maxNotional = 10_000): fc.Arbitrary<TradeOrder> =>
  fc.record({
    id: fc.uuid(),
    extensionId: fc.constantFrom("alpaca", "polymarket", "kalshi", "manifold"),
    symbol: fc.constantFrom("AAPL", "MSFT", "GOOG", "TSLA", "AMZN"),
    side: fc.constantFrom("buy" as const, "sell" as const),
    quantity: fc.double({ min: 0.001, max: 10_000, noNaN: true }),
    priceUsd: fc.double({ min: 0.01, max: 100_000, noNaN: true }),
    notionalUsd: fc.double({ min: 0.01, max: maxNotional, noNaN: true }),
    orderType: fc.constantFrom(
      "market" as const,
      "limit" as const,
      "stop" as const,
      "stop_limit" as const,
      "trailing_stop" as const,
    ),
  });

/** Generate a TradeOrder with potentially invalid numeric fields. */
const arbBadNumericOrder: fc.Arbitrary<TradeOrder> = fc.record({
  id: fc.uuid(),
  extensionId: fc.constant("alpaca"),
  symbol: fc.constant("AAPL"),
  side: fc.constantFrom("buy" as const, "sell" as const),
  quantity: fc.constantFrom(NaN, Infinity, -Infinity, -1, 0, 0.001),
  priceUsd: fc.constantFrom(NaN, Infinity, -Infinity, -1, 0, 1),
  notionalUsd: fc.constantFrom(NaN, Infinity, -Infinity, -1, 0, 50),
  orderType: fc.constant("market" as const),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TradingPolicyEngine — property-based tests", () => {
  beforeEach(() => {
    mockKillSwitchActive = false;
    mockKillSwitchMode = "hard";
    mockState = defaultPolicyState();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Invariant: every order gets a decision
  // -------------------------------------------------------------------------
  describe("invariant: every order produces a valid decision", () => {
    it("always returns a decision with outcome, reason, and approvalMode", async () => {
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.aggressive);

      await fc.assert(
        fc.asyncProperty(arbTradeOrder(100), async (order) => {
          const decision = await engine.evaluateOrder(order);
          expect(decision.outcome).toMatch(/^(approved|denied|pending_confirmation)$/);
          expect(typeof decision.reason).toBe("string");
          expect(decision.reason.length).toBeGreaterThan(0);
          expect(decision.approvalMode).toMatch(/^(auto|confirm|manual)$/);
        }),
        { numRuns: 200 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: kill switch blocks all buys in hard mode
  // -------------------------------------------------------------------------
  describe("invariant: hard kill switch blocks all buys", () => {
    it("denies every buy order when kill switch is active in hard mode", async () => {
      mockKillSwitchActive = true;
      mockKillSwitchMode = "hard";
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.aggressive);

      await fc.assert(
        fc.asyncProperty(arbTradeOrder(100), async (order) => {
          order.side = "buy";
          const decision = await engine.evaluateOrder(order);
          expect(decision.outcome).toBe("denied");
          expect(decision.failedStep).toBe("kill_switch");
        }),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: soft kill switch allows sells
  // -------------------------------------------------------------------------
  describe("invariant: soft kill switch allows sells through", () => {
    it("does not deny sells at kill_switch step in soft mode", async () => {
      mockKillSwitchActive = true;
      mockKillSwitchMode = "soft";
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.aggressive);

      await fc.assert(
        fc.asyncProperty(arbTradeOrder(100), async (order) => {
          order.side = "sell";
          const decision = await engine.evaluateOrder(order);
          // Should NOT be denied at kill_switch step (may be denied for other reasons)
          if (decision.outcome === "denied") {
            expect(decision.failedStep).not.toBe("kill_switch");
          }
        }),
        { numRuns: 100 },
      );
    });

    it("denies buys at kill_switch step in soft mode", async () => {
      mockKillSwitchActive = true;
      mockKillSwitchMode = "soft";
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.aggressive);

      await fc.assert(
        fc.asyncProperty(arbTradeOrder(100), async (order) => {
          order.side = "buy";
          const decision = await engine.evaluateOrder(order);
          expect(decision.outcome).toBe("denied");
          expect(decision.failedStep).toBe("kill_switch");
        }),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: per-trade size limit
  // -------------------------------------------------------------------------
  describe("invariant: orders exceeding per-trade size are denied", () => {
    it("denies orders where notionalUsd > maxSingleTradeUsd", async () => {
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.conservative);
      // conservative maxSingleTradeUsd = 25
      const maxTrade = RISK_TIER_PRESETS.conservative.limits.maxSingleTradeUsd;

      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: maxTrade + 0.01, max: 100_000, noNaN: true }),
          async (notional) => {
            const order: TradeOrder = {
              id: "test",
              extensionId: "alpaca",
              symbol: "AAPL",
              side: "buy",
              quantity: 1,
              priceUsd: notional,
              notionalUsd: notional,
              orderType: "market",
            };
            const decision = await engine.evaluateOrder(order);
            expect(decision.outcome).toBe("denied");
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: daily spend limit
  // -------------------------------------------------------------------------
  describe("invariant: orders that would exceed daily spend are denied", () => {
    it("denies when dailySpendUsd + notionalUsd > maxDailySpendUsd", async () => {
      const limits = RISK_TIER_PRESETS.aggressive.limits;

      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: limits.maxDailySpendUsd, noNaN: true }),
          fc.double({ min: 0.01, max: limits.maxSingleTradeUsd, noNaN: true }),
          async (currentSpend, notional) => {
            if (currentSpend + notional <= limits.maxDailySpendUsd) {
              return;
            } // skip non-breach cases
            mockState = { ...defaultPolicyState(), dailySpendUsd: currentSpend };

            const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.aggressive);
            const order: TradeOrder = {
              id: "test",
              extensionId: "alpaca",
              symbol: "AAPL",
              side: "buy",
              quantity: 1,
              priceUsd: notional,
              notionalUsd: notional,
              orderType: "market",
            };
            const decision = await engine.evaluateOrder(order);
            expect(decision.outcome).toBe("denied");
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: NaN/Infinity orders are always denied
  // -------------------------------------------------------------------------
  describe("invariant: orders with NaN/Infinity numeric values are denied", () => {
    it("denies orders with any NaN or Infinity in numeric fields", async () => {
      const engine = new TradingPolicyEngine(RISK_TIER_PRESETS.aggressive);

      await fc.assert(
        fc.asyncProperty(arbBadNumericOrder, async (order) => {
          const hasInvalid =
            !Number.isFinite(order.notionalUsd) ||
            order.notionalUsd < 0 ||
            !Number.isFinite(order.quantity) ||
            order.quantity <= 0 ||
            !Number.isFinite(order.priceUsd) ||
            order.priceUsd < 0 ||
            (order.notionalUsd === 0 && order.side === "buy");

          const decision = await engine.evaluateOrder(order);

          if (hasInvalid) {
            expect(decision.outcome).toBe("denied");
          }
        }),
        { numRuns: 500 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: approval mode consistency
  // -------------------------------------------------------------------------
  describe("invariant: approval mode determines outcome type for passing orders", () => {
    it("auto mode -> approved, confirm mode -> pending_confirmation", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("conservative", "moderate", "aggressive" as const),
          async (tier) => {
            mockState = defaultPolicyState(); // Reset state for each run
            const config = RISK_TIER_PRESETS[tier];
            const engine = new TradingPolicyEngine(config);
            // Use a tiny order that passes all checks
            const order: TradeOrder = {
              id: "test",
              extensionId: "alpaca",
              symbol: "X",
              side: "buy",
              quantity: 0.001,
              priceUsd: 0.01,
              notionalUsd: 0.01,
              orderType: "market",
            };
            const decision = await engine.evaluateOrder(order);

            if (decision.outcome !== "denied") {
              if (config.approvalMode === "auto") {
                expect(decision.outcome).toBe("approved");
              } else {
                expect(decision.outcome).toBe("pending_confirmation");
              }
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: per-extension overrides don't violate denial
  // -------------------------------------------------------------------------
  describe("invariant: per-extension overrides apply correctly", () => {
    it("extension-specific maxSingleTradeUsd overrides global limit", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 1, max: 100, noNaN: true }),
          fc.double({ min: 1, max: 100, noNaN: true }),
          async (globalLimit, extensionLimit) => {
            mockState = defaultPolicyState();
            const config: TradingPolicyConfig = {
              ...RISK_TIER_PRESETS.aggressive,
              limits: {
                ...RISK_TIER_PRESETS.aggressive.limits,
                maxSingleTradeUsd: globalLimit,
              },
              perExtension: {
                alpaca: { maxSingleTradeUsd: extensionLimit },
              },
            };
            const engine = new TradingPolicyEngine(config);
            // Order right at the extension limit
            const order: TradeOrder = {
              id: "test",
              extensionId: "alpaca",
              symbol: "X",
              side: "buy",
              quantity: 1,
              priceUsd: extensionLimit + 1,
              notionalUsd: extensionLimit + 1,
              orderType: "market",
            };
            const decision = await engine.evaluateOrder(order);
            // Should be denied based on extension limit, not global
            expect(decision.outcome).toBe("denied");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: consecutive losses gate
  // -------------------------------------------------------------------------
  describe("invariant: consecutive losses at or above threshold deny orders", () => {
    it("denies when consecutiveLosses >= consecutiveLossPause", async () => {
      const config = RISK_TIER_PRESETS.conservative;

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: config.limits.consecutiveLossPause, max: 100 }),
          async (losses) => {
            mockState = { ...defaultPolicyState(), consecutiveLosses: losses };
            const engine = new TradingPolicyEngine(config);
            const order: TradeOrder = {
              id: "test",
              extensionId: "alpaca",
              symbol: "X",
              side: "buy",
              quantity: 0.001,
              priceUsd: 0.01,
              notionalUsd: 0.01,
              orderType: "market",
            };
            const decision = await engine.evaluateOrder(order);
            expect(decision.outcome).toBe("denied");
            expect(decision.failedStep).toBe("consecutive_losses");
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: max open positions gate
  // -------------------------------------------------------------------------
  describe("invariant: max open positions gate", () => {
    it("denies when openPositionCount >= maxOpenPositions", async () => {
      const config = RISK_TIER_PRESETS.conservative;

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: config.limits.maxOpenPositions, max: 100 }),
          async (positions) => {
            mockState = { ...defaultPolicyState(), openPositionCount: positions };
            const engine = new TradingPolicyEngine(config);
            const order: TradeOrder = {
              id: "test",
              extensionId: "alpaca",
              symbol: "X",
              side: "buy",
              quantity: 0.001,
              priceUsd: 0.01,
              notionalUsd: 0.01,
              orderType: "market",
            };
            const decision = await engine.evaluateOrder(order);
            expect(decision.outcome).toBe("denied");
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: daily trade count gate
  // -------------------------------------------------------------------------
  describe("invariant: daily trade count gate", () => {
    it("denies when dailyTradeCount >= maxTradesPerDay", async () => {
      const config = RISK_TIER_PRESETS.conservative;

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: config.limits.maxTradesPerDay, max: 1000 }),
          async (count) => {
            mockState = { ...defaultPolicyState(), dailyTradeCount: count };
            const engine = new TradingPolicyEngine(config);
            const order: TradeOrder = {
              id: "test",
              extensionId: "alpaca",
              symbol: "X",
              side: "buy",
              quantity: 0.001,
              priceUsd: 0.01,
              notionalUsd: 0.01,
              orderType: "market",
            };
            const decision = await engine.evaluateOrder(order);
            expect(decision.outcome).toBe("denied");
            expect(decision.failedStep).toBe("max_trades_per_day");
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
