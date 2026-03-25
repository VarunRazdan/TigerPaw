import { describe, it, expect, vi, beforeEach } from "vitest";

const _mockEvaluateOrder = vi.fn();
vi.mock("tigerpaw/trading", () => ({
  TradingPolicyEngine: function (this: Record<string, unknown>) {
    this.evaluateOrder = _mockEvaluateOrder;
  },
  writeAuditEntry: vi.fn().mockResolvedValue(undefined),
  updatePolicyState: vi.fn().mockResolvedValue({}),
  withPlatformPortfolio: vi.fn(() => ({})),
  withPlatformPositionCount: vi.fn(() => ({ positionCountByPlatform: {}, openPositionCount: 0 })),
  autoActivateIfBreached: vi.fn().mockResolvedValue(false),
}));

vi.mock("./config.js", () => ({
  ibkrConfigSchema: {
    parse: (v: unknown) => v,
  },
  getBaseUrl: () => "https://localhost:5000/v1/api",
}));

import ibkrPlugin from "./index.js";

type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };
type ToolResult = { content: { type: string; text: string }[]; details?: Record<string, unknown> };

describe("IBKR order flow", () => {
  let tools: Map<string, ToolDef>;
  const mockEvaluateOrder = _mockEvaluateOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Map();

    global.fetch = vi.fn();

    const mockApi = {
      pluginConfig: {
        gatewayHost: "localhost:5000",
        accountId: "U1234567",
        mode: "paper",
      },
      tradingPolicyConfig: {
        tier: "conservative",
        approvalMode: "auto",
        limits: {
          maxRiskPerTradePercent: 2,
          dailyLossLimitPercent: 5,
          maxPortfolioDrawdownPercent: 20,
          maxSinglePositionPercent: 10,
          maxTradesPerDay: 25,
          maxOpenPositions: 8,
          cooldownBetweenTradesMs: 30000,
          consecutiveLossPause: 5,
          maxDailySpendUsd: 500,
          maxSingleTradeUsd: 100,
        },
        confirm: { timeoutMs: 60000, showNotification: true },
        manual: { timeoutMs: 300000 },
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerTool: vi.fn((def: ToolDef) => {
        tools.set(def.name, def);
      }),
      registerService: vi.fn(),
    };

    ibkrPlugin.register(mockApi as any);
  });

  it("posts order to Client Portal API path with accountId", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            orderId: 12345,
            conid: 265598,
            symbol: "AAPL",
            side: "BUY",
            orderType: "MKT",
            quantity: 10,
            filledQuantity: 0,
            status: "Submitted",
            lastFillPrice: 0,
          },
        ]),
    });

    const tool = tools.get("ibkr_place_order")!;
    const result = (await tool.execute("call-1", {
      conid: 265598,
      symbol: "AAPL",
      qty: 10,
      side: "BUY",
      orderType: "MKT",
      price: 150,
    })) as ToolResult;

    expect(result.content[0].text).toContain("Order placed successfully");

    // Verify the fetch URL includes the account ID path
    const fetchCall = (global.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain("/iserver/account/U1234567/orders");
  });

  it("sends bracket order with parent + stop loss + take profit", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            orderId: 12346,
            conid: 265598,
            symbol: "AAPL",
            side: "BUY",
            orderType: "MKT",
            quantity: 5,
            filledQuantity: 0,
            status: "Submitted",
            lastFillPrice: 0,
          },
        ]),
    });

    const tool = tools.get("ibkr_place_bracket_order")!;
    const result = (await tool.execute("call-2", {
      conid: 265598,
      symbol: "AAPL",
      qty: 5,
      side: "BUY",
      stopLossPrice: 140,
      takeProfitPrice: 170,
    })) as ToolResult;

    expect(result.content[0].text).toContain("Bracket order placed");

    // Verify the body contains 3 orders
    const fetchCall = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.orders).toHaveLength(3);
    // Parent order
    expect(body.orders[0].side).toBe("BUY");
    // Stop loss — opposite side
    expect(body.orders[1].side).toBe("SELL");
    expect(body.orders[1].orderType).toBe("STP");
    expect(body.orders[1].auxPrice).toBe(140);
    // Take profit — opposite side
    expect(body.orders[2].side).toBe("SELL");
    expect(body.orders[2].orderType).toBe("LMT");
    expect(body.orders[2].price).toBe(170);
  });

  it("normalizes BUY/SELL to buy/sell for policy engine", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            orderId: 12347,
            conid: 265598,
            symbol: "MSFT",
            side: "SELL",
            orderType: "LMT",
            quantity: 20,
            filledQuantity: 0,
            status: "Submitted",
            lastFillPrice: 0,
          },
        ]),
    });

    const tool = tools.get("ibkr_place_order")!;
    await tool.execute("call-3", {
      conid: 265598,
      symbol: "MSFT",
      qty: 20,
      side: "SELL",
      orderType: "LMT",
      price: 400,
    });

    // Verify evaluateOrder receives normalized lowercase "sell"
    expect(mockEvaluateOrder).toHaveBeenCalledTimes(1);
    const orderArg = mockEvaluateOrder.mock.calls[0][0];
    expect(orderArg.side).toBe("sell");
    expect(orderArg.extensionId).toBe("ibkr");
  });
});
