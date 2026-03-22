import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_TRADING_CONFIG, validateTradingConfig, type TradingConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<TradingConfig> = {}): TradingConfig {
  const base = structuredClone(DEFAULT_TRADING_CONFIG);
  return { ...base, ...overrides };
}

function errorFields(errors: ReturnType<typeof validateTradingConfig>): string[] {
  return errors.map((e) => e.field);
}

// ---------------------------------------------------------------------------
// Cross-field validation
// ---------------------------------------------------------------------------

describe("validateTradingConfig — cross-field consistency", () => {
  it("errors when maxRiskPerTradePercent > dailyLossLimitPercent", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxRiskPerTradePercent = 10;
    cfg.policy.limits.dailyLossLimitPercent = 5;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).toContain("policy.limits.maxRiskPerTradePercent");
  });

  it("accepts when maxRiskPerTradePercent == dailyLossLimitPercent", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxRiskPerTradePercent = 5;
    cfg.policy.limits.dailyLossLimitPercent = 5;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).not.toContain("policy.limits.maxRiskPerTradePercent");
  });

  it("accepts when maxRiskPerTradePercent < dailyLossLimitPercent", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxRiskPerTradePercent = 1;
    cfg.policy.limits.dailyLossLimitPercent = 5;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).not.toContain("policy.limits.maxRiskPerTradePercent");
  });

  it("errors when maxSingleTradeUsd > maxDailySpendUsd", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxSingleTradeUsd = 200;
    cfg.policy.limits.maxDailySpendUsd = 100;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).toContain("policy.limits.maxSingleTradeUsd");
  });

  it("accepts when maxSingleTradeUsd == maxDailySpendUsd", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxSingleTradeUsd = 100;
    cfg.policy.limits.maxDailySpendUsd = 100;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).not.toContain("policy.limits.maxSingleTradeUsd");
  });

  it("accepts when maxSingleTradeUsd < maxDailySpendUsd", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxSingleTradeUsd = 25;
    cfg.policy.limits.maxDailySpendUsd = 100;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).not.toContain("policy.limits.maxSingleTradeUsd");
  });

  it("errors when maxSinglePositionPercent > 100", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxSinglePositionPercent = 150;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).toContain("policy.limits.maxSinglePositionPercent");
  });

  it("accepts maxSinglePositionPercent == 100", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxSinglePositionPercent = 100;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).not.toContain("policy.limits.maxSinglePositionPercent");
  });

  it("accepts maxSinglePositionPercent < 100", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxSinglePositionPercent = 5;
    const errors = validateTradingConfig(cfg);
    expect(errorFields(errors)).not.toContain("policy.limits.maxSinglePositionPercent");
  });

  it("reports multiple cross-field errors simultaneously", () => {
    const cfg = makeConfig();
    cfg.policy.limits.maxRiskPerTradePercent = 20;
    cfg.policy.limits.dailyLossLimitPercent = 5;
    cfg.policy.limits.maxSingleTradeUsd = 500;
    cfg.policy.limits.maxDailySpendUsd = 100;
    cfg.policy.limits.maxSinglePositionPercent = 200;
    const errors = validateTradingConfig(cfg);
    const fields = errorFields(errors);
    expect(fields).toContain("policy.limits.maxRiskPerTradePercent");
    expect(fields).toContain("policy.limits.maxSingleTradeUsd");
    expect(fields).toContain("policy.limits.maxSinglePositionPercent");
  });
});

// ---------------------------------------------------------------------------
// Property-based config validation
// ---------------------------------------------------------------------------

describe("validateTradingConfig — property-based", () => {
  it("default config always passes validation", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const errors = validateTradingConfig(DEFAULT_TRADING_CONFIG);
        expect(errors).toEqual([]);
      }),
    );
  });

  it("live mode with all-positive-finite limits passes validation", () => {
    fc.assert(
      fc.property(
        fc.record({
          maxRiskPerTradePercent: fc.double({ min: 0.1, max: 5, noNaN: true }),
          dailyLossLimitPercent: fc.double({ min: 5, max: 50, noNaN: true }),
          maxPortfolioDrawdownPercent: fc.double({ min: 1, max: 50, noNaN: true }),
          maxSinglePositionPercent: fc.double({ min: 1, max: 100, noNaN: true }),
          maxTradesPerDay: fc.integer({ min: 1, max: 1000 }),
          maxOpenPositions: fc.integer({ min: 1, max: 100 }),
          cooldownBetweenTradesMs: fc.integer({ min: 0, max: 300_000 }),
          consecutiveLossPause: fc.integer({ min: 1, max: 100 }),
          maxDailySpendUsd: fc.double({ min: 100, max: 1_000_000, noNaN: true }),
          maxSingleTradeUsd: fc.double({ min: 1, max: 100, noNaN: true }),
        }),
        (limits) => {
          const cfg = makeConfig({ mode: "live" });
          Object.assign(cfg.policy.limits, limits);
          const errors = validateTradingConfig(cfg);
          // May have cross-field errors, but no live-mode-specific "must be finite" errors
          const liveErrors = errors.filter((e) => e.message.includes("Live mode requires"));
          expect(liveErrors).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("live mode with NaN in any limit field always produces an error", () => {
    const limitKeys = [
      "maxDailySpendUsd",
      "maxSingleTradeUsd",
      "maxRiskPerTradePercent",
      "dailyLossLimitPercent",
      "maxPortfolioDrawdownPercent",
      "maxSinglePositionPercent",
      "maxTradesPerDay",
      "maxOpenPositions",
      "consecutiveLossPause",
    ] as const;

    fc.assert(
      fc.property(fc.constantFrom(...limitKeys), (key) => {
        const cfg = makeConfig({ mode: "live" });
        (cfg.policy.limits as Record<string, number>)[key] = NaN;
        const errors = validateTradingConfig(cfg);
        expect(errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  it("paper mode never produces live-mode-specific errors regardless of limits", () => {
    fc.assert(
      fc.property(
        fc.record({
          maxDailySpendUsd: fc.oneof(
            fc.constant(NaN),
            fc.constant(Infinity),
            fc.constant(-1),
            fc.constant(0),
          ),
          maxSingleTradeUsd: fc.oneof(
            fc.constant(NaN),
            fc.constant(Infinity),
            fc.constant(-1),
            fc.constant(0),
          ),
        }),
        (badLimits) => {
          const cfg = makeConfig({ mode: "paper" });
          Object.assign(cfg.policy.limits, badLimits);
          const errors = validateTradingConfig(cfg);
          const liveErrors = errors.filter((e) => e.message.includes("Live mode requires"));
          expect(liveErrors).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
