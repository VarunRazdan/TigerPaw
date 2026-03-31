/**
 * Tests for the backtest gateway RPC handlers.
 *
 * Mocks strategy registry, backtest engine, data providers,
 * and data generator to validate handler logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayRequestHandlerOptions } from "../types.js";

// ── Hoisted mocks ────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getStrategy: vi.fn(),
  runBacktest: vi.fn(),
  resolveDataProvider: vi.fn(),
  SyntheticDataProvider: vi.fn(),
  generateOHLCV: vi.fn(),
}));

vi.mock("../../../trading/strategies/registry.js", () => ({
  getStrategy: mocks.getStrategy,
}));

vi.mock("../../../trading/backtest/engine.js", () => ({
  runBacktest: mocks.runBacktest,
}));

vi.mock("../../../trading/backtest/resolve-provider.js", () => ({
  resolveDataProvider: mocks.resolveDataProvider,
}));

vi.mock("../../../trading/backtest/synthetic-provider.js", () => ({
  SyntheticDataProvider: mocks.SyntheticDataProvider,
}));

vi.mock("../../../trading/backtest/data-generator.js", () => ({
  generateOHLCV: mocks.generateOHLCV,
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeOpts(
  method: string,
  params: Record<string, unknown>,
): { opts: GatewayRequestHandlerOptions; respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  return {
    opts: {
      req: { type: "req" as const, method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
    respond,
  };
}

function makeBacktestResult(overrides?: Record<string, unknown>) {
  return {
    id: "bt-1",
    strategyId: "s1",
    completedAt: "2026-01-01T00:00:00Z",
    durationMs: 120,
    metrics: { sharpe: 1.2, maxDrawdown: 0.1 },
    trades: [],
    equityCurve: [{ ts: 0, equity: 10000 }],
    ...overrides,
  };
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: resolveDataProvider returns a provider whose fetchBars succeeds
  const mockProvider = {
    fetchBars: vi.fn().mockResolvedValue({
      bars: [{ o: 100, h: 105, l: 98, c: 103, v: 1000, t: "2025-01-01" }],
      source: "synthetic",
      cached: false,
    }),
  };
  mocks.resolveDataProvider.mockResolvedValue(mockProvider);
  mocks.runBacktest.mockResolvedValue(makeBacktestResult());
});

// ── Import handlers (after mocks are registered) ─────────────────

const { backtestHandlers } = await import("../backtest.js");

// ── backtest.run ─────────────────────────────────────────────────

describe("backtest.run", () => {
  const handler = backtestHandlers["backtest.run"];

  it("rejects missing strategyId", async () => {
    const { opts, respond } = makeOpts("backtest.run", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategyId is required" }),
    );
  });

  it("rejects when strategy is not found", async () => {
    mocks.getStrategy.mockResolvedValue(null);
    const { opts, respond } = makeOpts("backtest.run", { strategyId: "missing" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "strategy not found" }),
    );
  });

  it("uses default params when none are provided", async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: ["BTC"] });
    const { opts, respond } = makeOpts("backtest.run", { strategyId: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ strategyId: "s1", dataSource: "synthetic" }),
      undefined,
    );
    expect(mocks.runBacktest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        initialCapitalUsd: 10000,
        commissionPercent: 0.1,
        slippageBps: 5,
      }),
    );
  });

  it("passes custom params through to the engine", async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: ["ETH"] });
    const { opts, respond } = makeOpts("backtest.run", {
      strategyId: "s1",
      symbol: "ETH",
      days: 30,
      initialCapitalUsd: 50000,
      commissionPercent: 0.05,
      slippageBps: 2,
    });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, expect.anything(), undefined);
    expect(mocks.runBacktest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        symbol: "ETH",
        initialCapitalUsd: 50000,
        commissionPercent: 0.05,
        slippageBps: 2,
      }),
    );
  });

  it("falls back to strategy's first symbol, then DEMO", async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: ["AAPL", "GOOG"] });
    const { opts } = makeOpts("backtest.run", { strategyId: "s1" });
    await handler(opts);
    expect(mocks.runBacktest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ symbol: "AAPL" }),
    );
  });

  it('falls back to "DEMO" when strategy has no symbols and none provided', async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: [] });
    const { opts } = makeOpts("backtest.run", { strategyId: "s1" });
    await handler(opts);
    expect(mocks.runBacktest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ symbol: "DEMO" }),
    );
  });

  it('resolves "synthetic" data source', async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: ["BTC"] });
    const { opts, respond } = makeOpts("backtest.run", {
      strategyId: "s1",
      dataSource: "synthetic",
    });
    await handler(opts);
    expect(mocks.resolveDataProvider).toHaveBeenCalledWith("synthetic");
    expect(respond).toHaveBeenCalledWith(true, expect.anything(), undefined);
  });

  it("falls back to synthetic data when alpaca provider throws", async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: ["AAPL"] });

    // Make the primary provider throw
    const failingProvider = {
      fetchBars: vi.fn().mockRejectedValue(new Error("Alpaca 403")),
    };
    mocks.resolveDataProvider.mockResolvedValue(failingProvider);

    // Set up the synthetic fallback constructor (must use function, not arrow, for `new`)
    const syntheticFetchBars = vi.fn().mockResolvedValue({
      bars: [{ o: 100, h: 105, l: 98, c: 103, v: 1000, t: "2025-01-01" }],
      source: "synthetic",
      cached: false,
    });
    mocks.SyntheticDataProvider.mockImplementation(
      function (this: { fetchBars: typeof syntheticFetchBars }) {
        this.fetchBars = syntheticFetchBars;
      },
    );

    const { opts, respond } = makeOpts("backtest.run", {
      strategyId: "s1",
      dataSource: "alpaca",
    });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        dataWarning: expect.stringContaining("Alpaca data unavailable"),
      }),
      undefined,
    );
  });

  it("truncates trades to last 100", async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: ["BTC"] });
    const trades = Array.from({ length: 150 }, (_, i) => ({ id: `t${i}` }));
    mocks.runBacktest.mockResolvedValue(makeBacktestResult({ trades }));

    const { opts, respond } = makeOpts("backtest.run", { strategyId: "s1" });
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      tradeCount: number;
      trades: unknown[];
    };
    expect(payload.tradeCount).toBe(150);
    expect(payload.trades).toHaveLength(100);
  });

  it("responds with error on engine failure", async () => {
    mocks.getStrategy.mockResolvedValue({ id: "s1", symbols: ["BTC"] });
    mocks.runBacktest.mockRejectedValue(new Error("engine crashed"));

    const { opts, respond } = makeOpts("backtest.run", { strategyId: "s1" });
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── backtest.generate ────────────────────────────────────────────

describe("backtest.generate", () => {
  const handler = backtestHandlers["backtest.generate"];

  it("generates OHLCV data with default params", async () => {
    mocks.generateOHLCV.mockReturnValue([
      { o: 150, h: 155, l: 148, c: 152, v: 500, t: "2025-01-01" },
      { o: 152, h: 157, l: 150, c: 154, v: 600, t: "2025-01-02" },
    ]);

    const { opts, respond } = makeOpts("backtest.generate", {});
    await handler(opts);

    expect(mocks.generateOHLCV).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "DEMO",
        startPrice: 150,
        pattern: "random",
        seed: 42,
      }),
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ symbol: "DEMO", bars: 2 }),
      undefined,
    );
  });

  it("passes custom params to generateOHLCV", async () => {
    mocks.generateOHLCV.mockReturnValue([]);

    const { opts, respond } = makeOpts("backtest.generate", {
      symbol: "ETH",
      days: 60,
      pattern: "trend-up",
      startPrice: 3000,
      seed: 99,
    });
    await handler(opts);

    expect(mocks.generateOHLCV).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "ETH",
        startPrice: 3000,
        pattern: "trend-up",
        seed: 99,
      }),
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ symbol: "ETH", bars: 0, sample: [] }),
      undefined,
    );
  });

  it("returns at most 5 sample bars", async () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({
      o: 100 + i,
      h: 110 + i,
      l: 95 + i,
      c: 105 + i,
      v: 1000,
      t: `2025-01-${String(i + 1).padStart(2, "0")}`,
    }));
    mocks.generateOHLCV.mockReturnValue(bars);

    const { opts, respond } = makeOpts("backtest.generate", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      bars: number;
      sample: unknown[];
    };
    expect(payload.bars).toBe(20);
    expect(payload.sample).toHaveLength(5);
  });

  it("responds with error on generator failure", async () => {
    mocks.generateOHLCV.mockImplementation(() => {
      throw new Error("bad seed");
    });

    const { opts, respond } = makeOpts("backtest.generate", {});
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});
