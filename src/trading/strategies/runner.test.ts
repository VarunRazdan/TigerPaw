import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketSnapshot } from "./signals.js";
import type { StrategyDefinition, StrategyExecution } from "./types.js";

// Mock dependencies
vi.mock("../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../plugin-sdk/file-lock.js", () => ({
  withFileLock: vi.fn(async (_fp: string, _opts: unknown, fn: () => Promise<unknown>) => fn()),
}));

// In-memory stores for registry
let strategies: StrategyDefinition[];
let executions: StrategyExecution[];

vi.mock("./registry.js", () => ({
  getStrategy: vi.fn(async (id: string) => strategies.find((s) => s.id === id)),
  recordExecution: vi.fn(async (exec: StrategyExecution) => {
    executions.push(exec);
  }),
  updateStrategyPerformance: vi.fn(),
}));

vi.mock("../policy-state.js", () => ({
  loadPolicyState: vi.fn(async () => ({
    dailyPnlUsd: 0,
    consecutiveLosses: 0,
    currentPortfolioValueUsd: 10_000,
    positionsByAsset: {},
    openPositionCount: 0,
  })),
}));

const { executeStrategy } = await import("./runner.js");
const { loadPolicyState } = await import("../policy-state.js");

function makeStrategy(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    id: "strat-1",
    name: "Test",
    description: "test strategy",
    enabled: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    symbols: ["AAPL"],
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
      maxPositionPercent: 25,
    },
    schedule: "continuous",
    totalTrades: 0,
    winRate: 0,
    totalPnlUsd: 0,
    ...overrides,
  };
}

function makeDeps() {
  return {
    submitOrder: vi.fn(async () => ({
      orderId: "order-123",
      outcome: "submitted",
    })),
    getMarketData: vi.fn(
      async (symbol: string): Promise<MarketSnapshot> => ({
        symbol,
        currentPrice: 100,
        previousClose: 98,
        priceHistory: [100, 98, 97, 96, 95],
      }),
    ),
  };
}

beforeEach(() => {
  strategies = [];
  executions = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------- validation ------------------------------------------------------

describe("validation", () => {
  it("throws when strategy does not exist", async () => {
    const deps = makeDeps();
    await expect(executeStrategy("nope", deps)).rejects.toThrow("Strategy not found");
  });

  it("throws when strategy is disabled", async () => {
    strategies.push(makeStrategy({ enabled: false }));
    const deps = makeDeps();
    await expect(executeStrategy("strat-1", deps)).rejects.toThrow("Strategy is disabled");
  });
});

// ---------- risk controls ---------------------------------------------------

describe("risk controls", () => {
  it("stops execution when daily loss limit is reached", async () => {
    strategies.push(makeStrategy({ maxDailyLossUsd: 100 }));
    vi.mocked(loadPolicyState).mockResolvedValueOnce({
      dailyPnlUsd: -150,
      consecutiveLosses: 0,
      currentPortfolioValueUsd: 10_000,
      positionsByAsset: {},
    } as never);
    const deps = makeDeps();
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("stopped");
    expect(result.error).toContain("Daily loss limit");
    expect(deps.submitOrder).not.toHaveBeenCalled();
  });

  it("stops execution when consecutive loss limit is reached", async () => {
    strategies.push(makeStrategy({ killOnConsecutiveLosses: 3 }));
    vi.mocked(loadPolicyState).mockResolvedValueOnce({
      dailyPnlUsd: 0,
      consecutiveLosses: 5,
      currentPortfolioValueUsd: 10_000,
      positionsByAsset: {},
    } as never);
    const deps = makeDeps();
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("stopped");
    expect(result.error).toContain("Consecutive loss limit");
  });

  it("skips symbols when max concurrent positions reached", async () => {
    strategies.push(makeStrategy({ maxConcurrentPositions: 1 }));
    vi.mocked(loadPolicyState).mockResolvedValueOnce({
      dailyPnlUsd: 0,
      consecutiveLosses: 0,
      currentPortfolioValueUsd: 10_000,
      positionsByAsset: { BTC: 1, ETH: 2 },
    } as never);
    const deps = makeDeps();
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("completed");
    expect(deps.submitOrder).not.toHaveBeenCalled();
  });
});

// ---------- signal evaluation -----------------------------------------------

describe("signal evaluation", () => {
  it("skips order when signal strength is below threshold", async () => {
    strategies.push(
      makeStrategy({
        entryRule: { minSignalStrength: 0.99, orderType: "market" },
        signals: [
          {
            id: "sig-1",
            type: "price_above",
            params: { threshold: 200 }, // won't trigger at price 100
            weight: 1,
          },
        ],
      }),
    );
    const deps = makeDeps();
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("completed");
    expect(deps.submitOrder).not.toHaveBeenCalled();
  });

  it("submits order when signal is strong enough", async () => {
    strategies.push(makeStrategy());
    const deps = makeDeps();
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("completed");
    expect(deps.submitOrder).toHaveBeenCalledTimes(1);
    expect(result.ordersSubmitted).toBe(1);
  });
});

// ---------- position sizing -------------------------------------------------

describe("position sizing", () => {
  it("uses fixed_usd sizing", async () => {
    strategies.push(
      makeStrategy({
        positionSizing: { method: "fixed_usd", fixedUsd: 500, maxPositionPercent: 50 },
      }),
    );
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    expect(deps.submitOrder).toHaveBeenCalledTimes(1);
    const call = deps.submitOrder.mock.calls[0][0];
    // 500 / 100 (price) = 5 shares
    expect(call.quantity).toBeCloseTo(5, 0);
  });

  it("uses percent_portfolio sizing", async () => {
    strategies.push(
      makeStrategy({
        positionSizing: {
          method: "percent_portfolio",
          percentPortfolio: 10,
          maxPositionPercent: 50,
        },
      }),
    );
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    const call = deps.submitOrder.mock.calls[0][0];
    // 10% of 10000 = 1000 / 100 = 10
    expect(call.quantity).toBeCloseTo(10, 0);
  });

  it("uses kelly sizing scaled by signal strength", async () => {
    strategies.push(
      makeStrategy({
        positionSizing: { method: "kelly", percentPortfolio: 20, maxPositionPercent: 50 },
      }),
    );
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    const call = deps.submitOrder.mock.calls[0][0];
    // Kelly: portfolioValue * (signalStrength * 20 / 100) / price
    // signalStrength = 1 (price_above 50 with price 100)
    // => 10000 * (1 * 20 / 100) / 100 = 20
    expect(call.quantity).toBeCloseTo(20, 0);
  });

  it("uses risk_parity sizing", async () => {
    strategies.push(
      makeStrategy({
        positionSizing: { method: "risk_parity", percentPortfolio: 5, maxPositionPercent: 50 },
      }),
    );
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    const call = deps.submitOrder.mock.calls[0][0];
    // 5% of 10000 = 500 / 100 = 5
    expect(call.quantity).toBeCloseTo(5, 0);
  });

  it("enforces max position concentration", async () => {
    strategies.push(
      makeStrategy({
        positionSizing: {
          method: "fixed_usd",
          fixedUsd: 50000, // way more than portfolio
          maxPositionPercent: 10, // 10% of 10000 = 1000
        },
      }),
    );
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    const call = deps.submitOrder.mock.calls[0][0];
    // capped at 1000 / 100 = 10
    expect(call.quantity).toBeCloseTo(10, 0);
  });
});

// ---------- order submission ------------------------------------------------

describe("order submission", () => {
  it("passes correct order parameters for market order", async () => {
    strategies.push(makeStrategy());
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    const call = deps.submitOrder.mock.calls[0][0];
    expect(call.extensionId).toBe("ext-1");
    expect(call.symbol).toBe("AAPL");
    expect(call.orderType).toBe("market");
    expect(call.side).toBe("buy");
    expect(call.limitPrice).toBeUndefined();
  });

  it("computes limit price offset for limit orders", async () => {
    strategies.push(
      makeStrategy({
        entryRule: {
          minSignalStrength: 0.5,
          orderType: "limit",
          limitOffsetPercent: 1,
        },
      }),
    );
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    const call = deps.submitOrder.mock.calls[0][0];
    expect(call.orderType).toBe("limit");
    // Buy side: price - 1% offset = 100 - 1 = 99
    expect(call.limitPrice).toBeCloseTo(99, 0);
  });

  it("processes multiple symbols", async () => {
    strategies.push(makeStrategy({ symbols: ["AAPL", "GOOG", "MSFT"] }));
    const deps = makeDeps();
    await executeStrategy("strat-1", deps);
    expect(deps.getMarketData).toHaveBeenCalledTimes(3);
    expect(deps.submitOrder).toHaveBeenCalledTimes(3);
  });
});

// ---------- completion / error states ---------------------------------------

describe("completion and error states", () => {
  it("records execution on success", async () => {
    strategies.push(makeStrategy());
    const deps = makeDeps();
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("completed");
    expect(result.completedAt).toBeTruthy();
    expect(result.ordersSubmitted).toBeGreaterThan(0);
    expect(executions).toHaveLength(1);
  });

  it("records execution on error", async () => {
    strategies.push(makeStrategy());
    const deps = makeDeps();
    deps.getMarketData.mockRejectedValue(new Error("Network fail"));
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("error");
    expect(result.error).toContain("Network fail");
    expect(executions).toHaveLength(1);
  });

  it("skips order when market price is zero", async () => {
    strategies.push(makeStrategy());
    const deps = makeDeps();
    deps.getMarketData.mockResolvedValue({
      symbol: "AAPL",
      currentPrice: 0,
      priceHistory: [0],
    });
    const result = await executeStrategy("strat-1", deps);
    expect(result.status).toBe("completed");
    expect(deps.submitOrder).not.toHaveBeenCalled();
  });

  it("has a valid execution id", async () => {
    strategies.push(makeStrategy());
    const deps = makeDeps();
    const result = await executeStrategy("strat-1", deps);
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe("string");
  });
});
