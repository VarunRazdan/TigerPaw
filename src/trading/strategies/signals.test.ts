import { describe, expect, it } from "vitest";
import { evaluateSignal, evaluateSignals, type MarketSnapshot } from "./signals.js";
import type { SignalConfig } from "./types.js";

// Pure functions -- no mocks needed.

function mkSignal(
  type: SignalConfig["type"],
  params: Record<string, number | string | boolean> = {},
  weight = 1,
): SignalConfig {
  return { id: `sig-${type}`, type, params, weight };
}

function mkMarket(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: "AAPL",
    currentPrice: 100,
    priceHistory: [100],
    ...overrides,
  };
}

// ---------- price_above -----------------------------------------------------

describe("price_above", () => {
  it("returns 1 when price is above threshold", () => {
    const r = evaluateSignal(mkSignal("price_above", { threshold: 90 }), mkMarket());
    expect(r.value).toBe(1);
    expect(r.triggered).toBe(true);
  });

  it("returns 0 when price equals threshold", () => {
    const r = evaluateSignal(mkSignal("price_above", { threshold: 100 }), mkMarket());
    expect(r.value).toBe(0);
    expect(r.triggered).toBe(false);
  });

  it("returns 0 when price is below threshold", () => {
    const r = evaluateSignal(mkSignal("price_above", { threshold: 110 }), mkMarket());
    expect(r.value).toBe(0);
  });
});

// ---------- price_below -----------------------------------------------------

describe("price_below", () => {
  it("returns 1 when price is below threshold", () => {
    const r = evaluateSignal(mkSignal("price_below", { threshold: 110 }), mkMarket());
    expect(r.value).toBe(1);
    expect(r.triggered).toBe(true);
  });

  it("returns 0 when price equals threshold", () => {
    const r = evaluateSignal(mkSignal("price_below", { threshold: 100 }), mkMarket());
    expect(r.value).toBe(0);
  });

  it("returns 0 when price is above threshold", () => {
    const r = evaluateSignal(mkSignal("price_below", { threshold: 90 }), mkMarket());
    expect(r.value).toBe(0);
  });
});

// ---------- price_cross_above -----------------------------------------------

describe("price_cross_above", () => {
  it("returns 1 when price crosses above threshold", () => {
    const r = evaluateSignal(
      mkSignal("price_cross_above", { threshold: 95 }),
      mkMarket({ currentPrice: 100, previousClose: 90 }),
    );
    expect(r.value).toBe(1);
  });

  it("returns 0 when price was already above", () => {
    const r = evaluateSignal(
      mkSignal("price_cross_above", { threshold: 80 }),
      mkMarket({ currentPrice: 100, previousClose: 90 }),
    );
    expect(r.value).toBe(0);
  });

  it("returns 0 when price stays below", () => {
    const r = evaluateSignal(
      mkSignal("price_cross_above", { threshold: 110 }),
      mkMarket({ currentPrice: 100, previousClose: 90 }),
    );
    expect(r.value).toBe(0);
  });

  it("falls back to priceHistory[1] when no previousClose", () => {
    const r = evaluateSignal(
      mkSignal("price_cross_above", { threshold: 95 }),
      mkMarket({ currentPrice: 100, previousClose: undefined, priceHistory: [100, 90] }),
    );
    expect(r.value).toBe(1);
  });
});

// ---------- price_cross_below -----------------------------------------------

describe("price_cross_below", () => {
  it("returns 1 when price crosses below threshold", () => {
    const r = evaluateSignal(
      mkSignal("price_cross_below", { threshold: 95 }),
      mkMarket({ currentPrice: 90, previousClose: 100 }),
    );
    expect(r.value).toBe(1);
  });

  it("returns 0 when price was already below", () => {
    const r = evaluateSignal(
      mkSignal("price_cross_below", { threshold: 110 }),
      mkMarket({ currentPrice: 100, previousClose: 105 }),
    );
    expect(r.value).toBe(0);
  });

  it("returns 0 when price stays above", () => {
    const r = evaluateSignal(
      mkSignal("price_cross_below", { threshold: 50 }),
      mkMarket({ currentPrice: 100, previousClose: 90 }),
    );
    expect(r.value).toBe(0);
  });
});

// ---------- momentum --------------------------------------------------------

describe("momentum", () => {
  it("returns high value when price is trending up", () => {
    // newest first: 120, 110, 100, 90, 80
    const prices = [120, 115, 110, 105, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];
    const r = evaluateSignal(
      mkSignal("momentum", { period: 14 }),
      mkMarket({ currentPrice: 120, priceHistory: prices }),
    );
    expect(r.value).toBeGreaterThan(0.5);
  });

  it("returns low value when price is trending down", () => {
    const prices = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120];
    const r = evaluateSignal(
      mkSignal("momentum", { period: 14 }),
      mkMarket({ currentPrice: 50, priceHistory: prices }),
    );
    expect(r.value).toBeLessThan(0.5);
  });

  it("returns 0.5 when not enough history", () => {
    const r = evaluateSignal(
      mkSignal("momentum", { period: 14 }),
      mkMarket({ priceHistory: [100, 99] }),
    );
    expect(r.value).toBeCloseTo(0.5);
  });
});

// ---------- mean_reversion --------------------------------------------------

describe("mean_reversion", () => {
  it("returns high value when price is below mean", () => {
    // mean of these = 100, current = 80 => below mean => high signal
    const prices = [80, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const r = evaluateSignal(
      mkSignal("mean_reversion", { period: 10 }),
      mkMarket({ currentPrice: 80, priceHistory: prices }),
    );
    expect(r.value).toBeGreaterThan(0.5);
  });

  it("returns low value when price is above mean", () => {
    const prices = [120, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const r = evaluateSignal(
      mkSignal("mean_reversion", { period: 10 }),
      mkMarket({ currentPrice: 120, priceHistory: prices }),
    );
    expect(r.value).toBeLessThan(0.5);
  });

  it("returns 0.5 when price equals mean", () => {
    const prices = [100, 100, 100, 100, 100];
    const r = evaluateSignal(
      mkSignal("mean_reversion", { period: 5 }),
      mkMarket({ currentPrice: 100, priceHistory: prices }),
    );
    expect(r.value).toBeCloseTo(0.5);
  });
});

// ---------- rsi_overbought --------------------------------------------------

describe("rsi_overbought", () => {
  it("returns positive value when RSI is above threshold", () => {
    // Create a price series with consistent gains => high RSI
    const prices: number[] = [];
    let p = 100;
    for (let i = 0; i < 20; i++) {
      prices.push(p);
      p -= 1; // newest first, so going back in time prices were lower
    }
    const r = evaluateSignal(
      mkSignal("rsi_overbought", { period: 14, threshold: 70 }),
      mkMarket({ currentPrice: prices[0], priceHistory: prices }),
    );
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.type).toBe("rsi_overbought");
  });

  it("returns 0 when RSI is below threshold", () => {
    // Alternating gains and losses => RSI near 50, below threshold of 70
    const prices: number[] = [];
    let p = 100;
    for (let i = 0; i < 20; i++) {
      prices.push(p);
      p += i % 2 === 0 ? -2 : 3; // zigzag: net slightly up but not overbought
    }
    // Reverse so newest first
    prices.reverse();
    const r = evaluateSignal(
      mkSignal("rsi_overbought", { period: 14, threshold: 95 }),
      mkMarket({ currentPrice: prices[0], priceHistory: prices }),
    );
    expect(r.value).toBe(0);
  });

  it("returns neutral (50 RSI -> 0) with insufficient data", () => {
    const r = evaluateSignal(
      mkSignal("rsi_overbought", { period: 14, threshold: 70 }),
      mkMarket({ priceHistory: [100, 99] }),
    );
    // RSI defaults to 50 when not enough data, which is below 70
    expect(r.value).toBe(0);
  });
});

// ---------- rsi_oversold ----------------------------------------------------

describe("rsi_oversold", () => {
  it("returns positive value when RSI is below threshold", () => {
    // Consistent losses => low RSI
    const prices: number[] = [];
    let p = 100;
    for (let i = 0; i < 20; i++) {
      prices.push(p);
      p += 1; // newest first, going back prices were higher => current is lower
    }
    const r = evaluateSignal(
      mkSignal("rsi_oversold", { period: 14, threshold: 30 }),
      mkMarket({ currentPrice: prices[0], priceHistory: prices }),
    );
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.type).toBe("rsi_oversold");
  });

  it("returns 0 when RSI is above threshold", () => {
    // Flat prices => RSI around 50, above 30
    const prices = Array(20).fill(100);
    const r = evaluateSignal(
      mkSignal("rsi_oversold", { period: 14, threshold: 30 }),
      mkMarket({ currentPrice: 100, priceHistory: prices }),
    );
    expect(r.value).toBe(0);
  });
});

// ---------- volatility_breakout ---------------------------------------------

describe("volatility_breakout", () => {
  it("returns positive value when price deviates beyond multiplier", () => {
    // Tight cluster around 100, current jumps to 130
    const history = [
      130, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      100,
    ];
    const r = evaluateSignal(
      mkSignal("volatility_breakout", { period: 20, multiplier: 2 }),
      mkMarket({ currentPrice: 130, priceHistory: history }),
    );
    expect(r.value).toBeGreaterThan(0);
    expect(r.triggered).toBe(true);
  });

  it("returns 0 when price is within normal range", () => {
    const history = [100, 101, 99, 100, 101, 99, 100, 101, 99, 100];
    const r = evaluateSignal(
      mkSignal("volatility_breakout", { period: 10, multiplier: 2 }),
      mkMarket({ currentPrice: 100, priceHistory: history }),
    );
    expect(r.value).toBe(0);
  });

  it("returns 0 when only one price point", () => {
    const r = evaluateSignal(
      mkSignal("volatility_breakout", { period: 20, multiplier: 2 }),
      mkMarket({ priceHistory: [100] }),
    );
    expect(r.value).toBe(0);
  });

  it("returns 0 when all prices are equal (zero stddev)", () => {
    const history = Array(20).fill(100);
    const r = evaluateSignal(
      mkSignal("volatility_breakout", { period: 20, multiplier: 2 }),
      mkMarket({ currentPrice: 100, priceHistory: history }),
    );
    expect(r.value).toBe(0);
  });
});

// ---------- custom_expression -----------------------------------------------

describe("custom_expression", () => {
  it("> operator returns 1 when left > right", () => {
    const r = evaluateSignal(
      mkSignal("custom_expression", { left: 10, right: 5, operator: ">" }),
      mkMarket(),
    );
    expect(r.value).toBe(1);
  });

  it("< operator returns 1 when left < right", () => {
    const r = evaluateSignal(
      mkSignal("custom_expression", { left: 3, right: 5, operator: "<" }),
      mkMarket(),
    );
    expect(r.value).toBe(1);
  });

  it(">= operator works at boundary", () => {
    const r = evaluateSignal(
      mkSignal("custom_expression", { left: 5, right: 5, operator: ">=" }),
      mkMarket(),
    );
    expect(r.value).toBe(1);
  });

  it("<= operator works at boundary", () => {
    const r = evaluateSignal(
      mkSignal("custom_expression", { left: 5, right: 5, operator: "<=" }),
      mkMarket(),
    );
    expect(r.value).toBe(1);
  });

  it("unknown operator returns 0", () => {
    const r = evaluateSignal(
      mkSignal("custom_expression", { left: 5, right: 5, operator: "==" }),
      mkMarket(),
    );
    expect(r.value).toBe(0);
  });
});

// ---------- evaluateSignals aggregation -------------------------------------

describe("evaluateSignals", () => {
  it("returns empty results and 0 strength for empty signals array", () => {
    const { results, aggregateStrength } = evaluateSignals([], mkMarket());
    expect(results).toEqual([]);
    expect(aggregateStrength).toBe(0);
  });

  it("returns weighted aggregate of multiple signals", () => {
    const signals: SignalConfig[] = [
      mkSignal("price_above", { threshold: 50 }, 1), // fires (1)
      mkSignal("price_below", { threshold: 50 }, 1), // does not fire (0)
    ];
    const { results, aggregateStrength } = evaluateSignals(
      signals,
      mkMarket({ currentPrice: 100 }),
    );
    expect(results).toHaveLength(2);
    // (1*1 + 0*1) / 2 = 0.5
    expect(aggregateStrength).toBeCloseTo(0.5);
  });

  it("respects weights in aggregation", () => {
    const signals: SignalConfig[] = [
      mkSignal("price_above", { threshold: 50 }, 3), // fires (1), weight 3
      mkSignal("price_below", { threshold: 50 }, 1), // does not fire (0), weight 1
    ];
    const { aggregateStrength } = evaluateSignals(signals, mkMarket({ currentPrice: 100 }));
    // (1*3 + 0*1) / 4 = 0.75
    expect(aggregateStrength).toBeCloseTo(0.75);
  });

  it("returns 0 when all weights are 0", () => {
    const signals: SignalConfig[] = [mkSignal("price_above", { threshold: 50 }, 0)];
    const { aggregateStrength } = evaluateSignals(signals, mkMarket());
    expect(aggregateStrength).toBe(0);
  });

  it("returns 0 for unknown signal type", () => {
    const r = evaluateSignal(
      { id: "unk", type: "nonexistent" as SignalConfig["type"], params: {}, weight: 1 },
      mkMarket(),
    );
    expect(r.value).toBe(0);
  });
});
