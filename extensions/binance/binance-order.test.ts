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
  binanceConfigSchema: {
    parse: (v: unknown) => v,
  },
  getBaseUrl: () => "https://testnet.binance.vision",
}));

import binancePlugin from "./index.js";

type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };
type ToolResult = { content: { type: string; text: string }[]; details?: Record<string, unknown> };

describe("Binance order flow", () => {
  let tools: Map<string, ToolDef>;
  const mockEvaluateOrder = _mockEvaluateOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Map();

    global.fetch = vi.fn();

    const mockApi = {
      pluginConfig: {
        apiKey: "test-binance-key",
        apiSecret: "test-binance-secret",
        mode: "testnet",
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

    binancePlugin.register(mockApi as any);
  });

  it("sends HMAC-SHA256 signed query with X-MBX-APIKEY header", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          orderId: 12345,
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          status: "NEW",
          origQty: "0.01",
          executedQty: "0",
          price: "50000.00000000",
          stopPrice: "0.00000000",
          time: Date.now(),
        }),
    });

    const tool = tools.get("binance_place_order")!;
    await tool.execute("call-1", {
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.01,
      price: 50000,
      timeInForce: "GTC",
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const url = fetchCall[0] as string;
    const headers = fetchCall[1].headers;

    // URL should contain signature parameter
    expect(url).toContain("signature=");
    // Header should include API key
    expect(headers["X-MBX-APIKEY"]).toBe("test-binance-key");
  });

  it("warns about stale price when ticker is >30s old", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    // First call: ticker with stale closeTime (>30s ago)
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            symbol: "ETHUSDT",
            lastPrice: "3000.00",
            closeTime: Date.now() - 60_000, // 60s ago — stale
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            orderId: 99999,
            symbol: "ETHUSDT",
            side: "BUY",
            type: "MARKET",
            status: "FILLED",
            origQty: "1",
            executedQty: "1",
            price: "0.00000000",
            stopPrice: "0.00000000",
            time: Date.now(),
          }),
      });

    const tool = tools.get("binance_place_order")!;
    const result = (await tool.execute("call-2", {
      symbol: "ETHUSDT",
      side: "BUY",
      quantity: 1,
    })) as ToolResult;

    expect(result.details?.priceStaleWarning).toBeDefined();
    expect(result.content[0].text).toContain("low liquidity");
  });

  it("does NOT warn about stale price when data is fresh", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            symbol: "BTCUSDT",
            lastPrice: "50000.00",
            closeTime: Date.now() - 5_000, // 5s ago — fresh
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            orderId: 88888,
            symbol: "BTCUSDT",
            side: "BUY",
            type: "MARKET",
            status: "FILLED",
            origQty: "0.001",
            executedQty: "0.001",
            price: "0.00000000",
            stopPrice: "0.00000000",
            time: Date.now(),
          }),
      });

    const tool = tools.get("binance_place_order")!;
    const result = (await tool.execute("call-3", {
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.001,
    })) as ToolResult;

    expect(result.details?.priceStaleWarning).toBeUndefined();
  });

  it("places OCO order to correct endpoint", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          orderListId: 7777,
          contingencyType: "OCO",
          listStatusType: "EXEC_STARTED",
          orders: [
            { symbol: "BTCUSDT", orderId: 1001, clientOrderId: "limit-leg" },
            { symbol: "BTCUSDT", orderId: 1002, clientOrderId: "stop-leg" },
          ],
        }),
    });

    const tool = tools.get("binance_place_oco_order")!;
    const result = (await tool.execute("call-4", {
      symbol: "BTCUSDT",
      side: "SELL",
      quantity: 0.01,
      price: 55000,
      stopPrice: 48000,
      stopLimitPrice: 47500,
    })) as ToolResult;

    expect(result.content[0].text).toContain("OCO order placed successfully");
    expect(result.details?.orderListId).toBe(7777);

    // Verify OCO endpoint was called
    const fetchCall = (global.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain("/api/v3/order/oco");
  });

  it("passes quantity as string in signed params", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          orderId: 77777,
          symbol: "ETHUSDT",
          side: "BUY",
          type: "MARKET",
          status: "NEW",
          origQty: "2.5",
          executedQty: "0",
          price: "0.00000000",
          stopPrice: "0.00000000",
          time: Date.now(),
        }),
    });

    const tool = tools.get("binance_place_order")!;
    await tool.execute("call-5", {
      symbol: "ETHUSDT",
      side: "BUY",
      quantity: 2.5,
      price: 3000,
      type: "LIMIT",
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const url = fetchCall[0] as string;
    // Quantity should appear as a string value in the URL
    expect(url).toContain("quantity=2.5");
  });
});
