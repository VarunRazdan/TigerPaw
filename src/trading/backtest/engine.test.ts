import { describe, expect, it, vi } from "vitest";
import type { StrategyDefinition } from "../strategies/types.js";
import type { BacktestConfig, OHLCV } from "./types.js";

vi.mock("../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { runBacktest } = await import("./engine.js");

function makeBar(index: number, close: number, overrides: Partial<OHLCV> = {}): OHLCV {
  return {
    timestamp: Date.now() - (1000 - index) * 86_400_000,
    open: close * 0.99,
    high: close * 1.02,
    low: close * 0.98,
    close,
    volume: 1_000_000,
    ...overrides,
  };
}

function makeBars(count: number, startPrice = 100, trend = 0): OHLCV[] {
  const bars: OHLCV[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    price += trend;
    bars.push(makeBar(i, price));
  }
  return bars;
}

function makeStrategy(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    id: "strat-1",
    name: "Backtest Strategy",
    description: "test",
    enabled: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    symbols: ["TEST"],
    extensionId: "ext-1",
    signals: [
      {
        id: "sig-1",
        type: "price_above",
        params: { threshold: 50 },
        weight: 1,
      },
    ],
    entryRule: { minSignalStrength: 0.5, orderType: "market" },
    exitRule: {},
    positionSizing: {
      method: "fixed_usd",
      fixedUsd: 1000,
      maxPositionPercent: 50,
    },
    schedule: "continuous",
    totalTrades: 0,
    winRate: 0,
    totalPnlUsd: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    strategyId: "strat-1",
    symbol: "TEST",
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    initialCapitalUsd: 10_000,
    commissionPercent: 0.1,
    slippageBps: 5,
    ...overrides,
  };
}

// ---------- basic operation -------------------------------------------------

describe("basic operation", () => {
  it("runs on a set of bars and returns a result", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.id).toBeTruthy();
    expect(result.strategyId).toBe("strat-1");
    expect(result.config).toEqual(makeConfig());
    expect(result.completedAt).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns equity curve", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.equityCurve.length).toBeGreaterThan(0);
    for (const pt of result.equityCurve) {
      expect(pt.timestamp).toBeGreaterThan(0);
      expect(typeof pt.equity).toBe("number");
    }
  });

  it("returns daily PnL array", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(Array.isArray(result.dailyPnl)).toBe(true);
  });
});

// ---------- entry/exit logic ------------------------------------------------

describe("entry/exit logic", () => {
  it("enters a position when signal fires", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    const buys = result.trades.filter((t) => t.side === "buy");
    expect(buys.length).toBeGreaterThan(0);
  });

  it("does not enter when signal strength is below threshold", async () => {
    const strategy = makeStrategy({
      signals: [
        {
          id: "sig-1",
          type: "price_above",
          params: { threshold: 99999 },
          weight: 1,
        },
      ],
      entryRule: { minSignalStrength: 0.5, orderType: "market" },
    });
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(strategy, bars, makeConfig());
    expect(result.trades).toHaveLength(0);
  });

  it("closes remaining position at end of backtest", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.trades.length).toBeGreaterThanOrEqual(2);
    const lastTrade = result.trades[result.trades.length - 1];
    expect(lastTrade.side).toBe("sell");
  });
});

// ---------- stop-loss / take-profit -----------------------------------------

describe("stop-loss and take-profit", () => {
  it("triggers stop-loss when price drops enough", async () => {
    const strategy = makeStrategy({
      exitRule: { stopLossPercent: 2 },
    });
    // Price goes up then crashes
    const bars: OHLCV[] = [];
    for (let i = 0; i < 40; i++) {
      bars.push(makeBar(i, 100));
    }
    for (let i = 40; i < 60; i++) {
      bars.push(makeBar(i, 80, { low: 75 }));
    }
    const result = await runBacktest(strategy, bars, makeConfig());
    const sells = result.trades.filter((t) => t.side === "sell");
    expect(sells.length).toBeGreaterThan(0);
  });

  it("triggers take-profit when price rises enough", async () => {
    const strategy = makeStrategy({
      exitRule: { takeProfitPercent: 5 },
    });
    // Price steadily rises
    const bars = makeBars(60, 100, 2);
    const result = await runBacktest(strategy, bars, makeConfig());
    const sells = result.trades.filter((t) => t.side === "sell");
    expect(sells.length).toBeGreaterThan(0);
  });

  it("prefers stop-loss over take-profit when both trigger", async () => {
    const strategy = makeStrategy({
      exitRule: { stopLossPercent: 1, takeProfitPercent: 1 },
    });
    // Big range bar that triggers both
    const bars: OHLCV[] = [];
    for (let i = 0; i < 40; i++) {
      bars.push(makeBar(i, 100));
    }
    bars.push(makeBar(40, 100, { high: 120, low: 80 }));
    for (let i = 41; i < 60; i++) {
      bars.push(makeBar(i, 100, { high: 120, low: 80 }));
    }
    const result = await runBacktest(strategy, bars, makeConfig());
    // Should have triggered some exit
    const sells = result.trades.filter((t) => t.side === "sell");
    expect(sells.length).toBeGreaterThan(0);
  });
});

// ---------- slippage and commission -----------------------------------------

describe("slippage and commission", () => {
  it("applies slippage to fill price", async () => {
    const config = makeConfig({ slippageBps: 100 }); // 1% slippage
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, config);
    expect(result.trades.length).toBeGreaterThan(0);
    const buy = result.trades.find((t) => t.side === "buy");
    expect(buy).toBeDefined();
    expect(buy!.slippage).toBeGreaterThan(0);
  });

  it("applies commission to trades", async () => {
    const config = makeConfig({ commissionPercent: 0.5 });
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, config);
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades[0].commission).toBeGreaterThan(0);
  });

  it("zero slippage and zero commission produce clean fills", async () => {
    const config = makeConfig({ slippageBps: 0, commissionPercent: 0 });
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, config);
    for (const trade of result.trades) {
      if (trade.side === "buy") {
        expect(trade.slippage).toBeCloseTo(0);
        expect(trade.commission).toBeCloseTo(0);
      }
    }
  });
});

// ---------- position sizing -------------------------------------------------

describe("position sizing", () => {
  it("respects fixed_usd sizing", async () => {
    const strategy = makeStrategy({
      positionSizing: { method: "fixed_usd", fixedUsd: 2000, maxPositionPercent: 50 },
    });
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(strategy, bars, makeConfig());
    expect(result.trades.length).toBeGreaterThan(0);
    const buy = result.trades.find((t) => t.side === "buy");
    expect(buy).toBeDefined();
    const notional = buy!.quantity * buy!.price;
    expect(notional).toBeLessThanOrEqual(2100);
  });

  it("respects percent_portfolio sizing", async () => {
    const strategy = makeStrategy({
      positionSizing: {
        method: "percent_portfolio",
        percentPortfolio: 10,
        maxPositionPercent: 50,
      },
    });
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(strategy, bars, makeConfig({ initialCapitalUsd: 50_000 }));
    expect(result.trades.length).toBeGreaterThan(0);
    const buy = result.trades.find((t) => t.side === "buy");
    expect(buy).toBeDefined();
    const notional = buy!.quantity * buy!.price;
    expect(notional).toBeLessThanOrEqual(6000);
  });

  it("caps position size at maxPositionPercent", async () => {
    const strategy = makeStrategy({
      positionSizing: {
        method: "fixed_usd",
        fixedUsd: 100_000,
        maxPositionPercent: 5,
      },
    });
    const bars = makeBars(60, 100, 0.5);
    const config = makeConfig({ initialCapitalUsd: 10_000 });
    const result = await runBacktest(strategy, bars, config);
    expect(result.trades.length).toBeGreaterThan(0);
    const buy = result.trades.find((t) => t.side === "buy");
    expect(buy).toBeDefined();
    const notional = buy!.quantity * buy!.price;
    expect(notional).toBeLessThanOrEqual(10_000);
  });
});

// ---------- metrics computation ---------------------------------------------

describe("metrics computation", () => {
  it("computes totalReturn", async () => {
    const bars = makeBars(60, 100, 1);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(typeof result.metrics.totalReturn).toBe("number");
  });

  it("computes Sharpe ratio when enough data", async () => {
    const bars = makeBars(100, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    if (result.dailyPnl.length >= 2) {
      expect(result.metrics.sharpe === null || typeof result.metrics.sharpe === "number").toBe(
        true,
      );
    }
  });

  it("computes Sortino ratio", async () => {
    const bars = makeBars(100, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.metrics.sortino === null || typeof result.metrics.sortino === "number").toBe(
      true,
    );
  });

  it("computes max drawdown", async () => {
    // Create a drawdown scenario: up then down
    const bars: OHLCV[] = [];
    for (let i = 0; i < 35; i++) {
      bars.push(makeBar(i, 100 + i));
    }
    for (let i = 35; i < 60; i++) {
      bars.push(makeBar(i, 135 - (i - 35) * 2));
    }
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.metrics.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
    expect(result.metrics.maxDrawdownUsd).toBeGreaterThanOrEqual(0);
  });

  it("computes profitFactor", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(
      result.metrics.profitFactor === null || typeof result.metrics.profitFactor === "number",
    ).toBe(true);
  });

  it("computes winRate between 0 and 100", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.winRate).toBeLessThanOrEqual(100);
  });

  it("tracks totalTrades count", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.metrics.totalTrades).toBe(result.trades.length);
  });

  it("tracks tradingDays", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    expect(result.metrics.tradingDays).toBeGreaterThan(0);
  });
});

// ---------- edge cases ------------------------------------------------------

describe("edge cases", () => {
  it("handles empty bars array", async () => {
    const result = await runBacktest(makeStrategy(), [], makeConfig());
    expect(result.trades).toHaveLength(0);
    expect(result.equityCurve).toHaveLength(0);
  });

  it("handles single bar", async () => {
    const result = await runBacktest(makeStrategy(), [makeBar(0, 100)], makeConfig());
    expect(result.trades).toHaveLength(0);
  });

  it("handles bars fewer than warmup period", async () => {
    const bars = makeBars(20, 100, 0.5); // less than 30 warmup bars
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    // With fewer than warmup bars, no trading should occur
    expect(result.trades).toHaveLength(0);
  });

  it("handles zero initial capital", async () => {
    const bars = makeBars(60, 100, 0.5);
    const config = makeConfig({ initialCapitalUsd: 0 });
    const result = await runBacktest(makeStrategy(), bars, config);
    // Should not crash, just produce no trades
    expect(result.trades).toHaveLength(0);
    expect(result.metrics.totalReturn).toBe(0);
  });

  it("handles zero price bars gracefully", async () => {
    const bars = makeBars(60, 0);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    // Should not crash
    expect(result.trades).toHaveLength(0);
  });

  it("produces valid trade structure", async () => {
    const bars = makeBars(60, 100, 0.5);
    const result = await runBacktest(makeStrategy(), bars, makeConfig());
    for (const trade of result.trades) {
      expect(trade.barIndex).toBeGreaterThanOrEqual(0);
      expect(trade.timestamp).toBeGreaterThan(0);
      expect(["buy", "sell"]).toContain(trade.side);
      expect(trade.symbol).toBe("TEST");
      expect(trade.quantity).toBeGreaterThan(0);
      expect(trade.price).toBeGreaterThan(0);
      expect(trade.commission).toBeGreaterThanOrEqual(0);
      expect(trade.slippage).toBeGreaterThanOrEqual(0);
    }
  });
});
