import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayClient } from "../src/gateway/client.js";
import { connectGatewayClient } from "../src/gateway/test-helpers.e2e.js";
import {
  type GatewayInstance,
  spawnGatewayInstance,
  stopGatewayInstance,
} from "./helpers/gateway-e2e-harness.js";

const E2E_TIMEOUT_MS = 120_000;

type TradingState = {
  dailyPnlUsd: number;
  dailySpendUsd: number;
  dailyTradeCount: number;
  consecutiveLosses: number;
  highWaterMarkUsd: number;
  currentPortfolioValueUsd: number;
  killSwitch: { active: boolean };
  platformKillSwitches: Record<string, { active: boolean }>;
  positionsByAsset: Record<string, unknown>;
  openPositionCount: number;
  date: string;
};

type FillResult = {
  dailyPnlUsd: number;
  consecutiveLosses: number;
  dailyTradeCount: number;
};

type QuoteResult = {
  symbol: string;
  extensionId: string;
  currentPrice: number;
  source: string;
};

describe("trading flow e2e", () => {
  let gateway: GatewayInstance;
  let client: GatewayClient;

  beforeAll(async () => {
    gateway = await spawnGatewayInstance("trading-flow");
    client = await connectGatewayClient({
      url: `ws://127.0.0.1:${gateway.port}`,
      token: gateway.gatewayToken,
    });
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    client?.stop();
    if (gateway) {
      await stopGatewayInstance(gateway);
    }
  });

  it("reads initial trading state with default zeros", { timeout: E2E_TIMEOUT_MS }, async () => {
    const state = await client.request<TradingState>("trading.getState", {});
    expect(state.dailyPnlUsd).toBe(0);
    expect(state.dailySpendUsd).toBe(0);
    expect(state.dailyTradeCount).toBe(0);
    expect(state.consecutiveLosses).toBe(0);
    expect(state.killSwitch.active).toBe(false);
    expect(typeof state.date).toBe("string");
  });

  it("records buy fill and increments dailyTradeCount", { timeout: E2E_TIMEOUT_MS }, async () => {
    const result = await client.request<FillResult>("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      executedPrice: 150,
      realizedPnl: 0,
    });
    expect(result.dailyTradeCount).toBeGreaterThanOrEqual(1);
  });

  it(
    "records sell fill with realizedPnl and updates dailyPnlUsd",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      const result = await client.request<FillResult>("trading.recordFill", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "sell",
        quantity: 10,
        executedPrice: 155,
        realizedPnl: 50,
      });
      expect(result.dailyPnlUsd).toBeGreaterThan(0);
    },
  );

  it("rejects recordFill with missing extensionId", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(
      client.request("trading.recordFill", {
        symbol: "AAPL",
        side: "buy",
        quantity: 10,
        executedPrice: 150,
      }),
    ).rejects.toThrow();
  });

  it("rejects recordFill with quantity 0", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(
      client.request("trading.recordFill", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 0,
        executedPrice: 150,
      }),
    ).rejects.toThrow();
  });

  it("rejects recordFill with negative executedPrice", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(
      client.request("trading.recordFill", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 10,
        executedPrice: -1,
      }),
    ).rejects.toThrow();
  });

  it("trading.getQuote returns baseline quote", { timeout: E2E_TIMEOUT_MS }, async () => {
    const quote = await client.request<QuoteResult>("trading.getQuote", {
      symbol: "AAPL",
      extensionId: "alpaca",
    });
    expect(quote.symbol).toBe("AAPL");
    expect(quote.extensionId).toBe("alpaca");
    expect(quote.currentPrice).toBe(0);
    expect(quote.source).toBe("none");
  });

  it("trading.getQuote rejects missing symbol", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(client.request("trading.getQuote", { extensionId: "alpaca" })).rejects.toThrow();
  });

  it("trading.getQuote rejects missing extensionId", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(client.request("trading.getQuote", { symbol: "AAPL" })).rejects.toThrow();
  });

  it(
    "consecutive negative fills update consecutiveLosses counter",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      // Record two consecutive losing fills
      const result1 = await client.request<FillResult>("trading.recordFill", {
        extensionId: "alpaca",
        symbol: "TSLA",
        side: "sell",
        quantity: 5,
        executedPrice: 200,
        realizedPnl: -25,
      });
      const losses1 = result1.consecutiveLosses;

      const result2 = await client.request<FillResult>("trading.recordFill", {
        extensionId: "alpaca",
        symbol: "TSLA",
        side: "sell",
        quantity: 5,
        executedPrice: 195,
        realizedPnl: -30,
      });
      expect(result2.consecutiveLosses).toBe(losses1 + 1);
    },
  );

  it("winning fill resets consecutiveLosses to 0", { timeout: E2E_TIMEOUT_MS }, async () => {
    // First ensure we have at least one consecutive loss
    await client.request<FillResult>("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "MSFT",
      side: "sell",
      quantity: 3,
      executedPrice: 300,
      realizedPnl: -10,
    });

    // Now record a winning trade
    const result = await client.request<FillResult>("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "MSFT",
      side: "sell",
      quantity: 3,
      executedPrice: 310,
      realizedPnl: 30,
    });
    expect(result.consecutiveLosses).toBe(0);
  });

  it("multiple buy fills correctly sum dailySpendUsd", { timeout: E2E_TIMEOUT_MS }, async () => {
    // Get current state to know the baseline
    const before = await client.request<TradingState>("trading.getState", {});
    const baselineSpend = before.dailySpendUsd;

    // Record two buy fills
    await client.request<FillResult>("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "GOOG",
      side: "buy",
      quantity: 2,
      executedPrice: 100,
      realizedPnl: 0,
    });
    await client.request<FillResult>("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "GOOG",
      side: "buy",
      quantity: 3,
      executedPrice: 100,
      realizedPnl: 0,
    });

    const after = await client.request<TradingState>("trading.getState", {});
    // 2*100 + 3*100 = 500 added
    expect(after.dailySpendUsd).toBe(baselineSpend + 500);
  });
});
