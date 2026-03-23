import { describe, it, expect, vi, beforeEach } from "vitest";

const _mockEvaluateOrder = vi.fn();
vi.mock("tigerpaw/trading", () => ({
  TradingPolicyEngine: function () {
    this.evaluateOrder = _mockEvaluateOrder;
  },
  writeAuditEntry: vi.fn().mockResolvedValue(undefined),
  updatePolicyState: vi.fn().mockResolvedValue({}),
  withPlatformPortfolio: vi.fn(() => ({})),
  withPlatformPositionCount: vi.fn(() => ({ positionCountByPlatform: {}, openPositionCount: 0 })),
  autoActivateIfBreached: vi.fn().mockResolvedValue(false),
}));

vi.mock("./config.js", () => ({
  polymarketConfigSchema: {
    parse: (v: unknown) => v,
  },
}));

import { updatePolicyState } from "tigerpaw/trading";
import polymarketPlugin from "./index.js";

type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };
type ToolResult = { content: { type: string; text: string }[]; details?: Record<string, unknown> };

describe("Polymarket order flow", () => {
  let tools: Map<string, ToolDef>;
  const mockEvaluateOrder = _mockEvaluateOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Map();

    global.fetch = vi.fn();

    const mockApi = {
      pluginConfig: {
        apiKey: "test-poly-key",
        apiSecret: "test-poly-secret",
        passphrase: "test-passphrase",
        privateKey: "0xdeadbeef",
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

    polymarketPlugin.register(mockApi as any);
  });

  it("sends HMAC-SHA256 signed headers with CLOB order", async () => {
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
          id: "clob-order-1",
          status: "submitted",
          market: "market-1",
          side: "buy",
          size: "10",
          price: "0.55",
          createdAt: "2026-01-01",
        }),
    });

    const tool = tools.get("polymarket_place_order")!;
    await tool.execute("call-1", {
      marketId: "market-1",
      side: "buy",
      size: 10,
      price: 0.55,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["POLY-API-KEY"]).toBe("test-poly-key");
    expect(headers["POLY-PASSPHRASE"]).toBe("test-passphrase");
    expect(headers["POLY-SIGNATURE"]).toBeDefined();
    expect(headers["POLY-TIMESTAMP"]).toBeDefined();
  });

  it("places order when policy engine approves", async () => {
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
          id: "clob-order-2",
          status: "submitted",
          market: "market-2",
          side: "buy",
          size: "5",
          price: "0.70",
          createdAt: "2026-01-01",
        }),
    });

    const tool = tools.get("polymarket_place_order")!;
    const result = (await tool.execute("call-2", {
      marketId: "market-2",
      side: "buy",
      size: 5,
      price: 0.7,
    })) as ToolResult;

    expect(result.content[0].text).toContain("Order placed successfully");
    expect(result.details?.orderId).toBe("clob-order-2");
    expect(result.details?.notionalUsd).toBe(3.5);
  });

  it("rejects orders with price outside 0.00-1.00", async () => {
    const tool = tools.get("polymarket_place_order")!;
    const result = (await tool.execute("call-3", {
      marketId: "market-3",
      side: "buy",
      size: 10,
      price: 1.5,
    })) as ToolResult;

    expect(result.content[0].text).toContain("Price must be between 0.00 and 1.00");
    expect(result.details?.error).toBe("invalid_price");
    // Policy engine should not have been called
    expect(mockEvaluateOrder).not.toHaveBeenCalled();
  });

  it("updates daily spend after successful buy order", async () => {
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
          id: "clob-order-4",
          status: "submitted",
          market: "market-4",
          side: "buy",
          size: "20",
          price: "0.60",
          createdAt: "2026-01-01",
        }),
    });

    const tool = tools.get("polymarket_place_order")!;
    await tool.execute("call-4", {
      marketId: "market-4",
      side: "buy",
      size: 20,
      price: 0.6,
    });

    expect(updatePolicyState).toHaveBeenCalledTimes(1);
    const updaterFn = (updatePolicyState as any).mock.calls[0][0];
    const mockState = {
      dailyTradeCount: 5,
      dailySpendUsd: 100,
      lastTradeAtMs: 0,
    };
    const result = updaterFn(mockState);
    expect(result.dailyTradeCount).toBe(6);
    expect(result.dailySpendUsd).toBe(112); // 100 + 20 * 0.60 = 112
  });
});
