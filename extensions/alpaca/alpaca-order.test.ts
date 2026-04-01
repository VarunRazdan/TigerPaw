import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock trading module — use function() (not arrow) so it works with `new`
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
  checkKillSwitch: vi.fn().mockResolvedValue({ active: false }),
  isOrderAllowedUnderKillSwitch: vi.fn().mockReturnValue(true),
}));

// Mock config
vi.mock("./config.js", () => ({
  alpacaConfigSchema: {
    parse: (v: unknown) => v,
  },
  getBaseUrl: () => "https://paper-api.alpaca.markets",
  DATA_BASE_URL: "https://data.alpaca.markets",
}));

import { updatePolicyState } from "tigerpaw/trading";
// Import after mocks
import alpacaPlugin from "./index.js";

// Helper types
type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };
type ToolResult = { content: { type: string; text: string }[]; details?: Record<string, unknown> };

describe("Alpaca order flow", () => {
  let tools: Map<string, ToolDef>;
  const mockEvaluateOrder = _mockEvaluateOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Map();

    // Mock fetch globally
    global.fetch = vi.fn();

    const mockApi = {
      pluginConfig: {
        apiKeyId: "test-key",
        apiSecretKey: "test-secret",
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
        confirm: { timeoutMs: 60000, showNotification: true, timeoutAction: "deny" },
        manual: { timeoutMs: 300000, timeoutAction: "deny" },
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerTool: vi.fn((def: ToolDef) => {
        tools.set(def.name, def);
      }),
      registerService: vi.fn(),
    };

    alpacaPlugin.register(mockApi as any);
  });

  it("auto-approves and places order when policy engine approves", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    // Mock quote fetch for price estimation
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            equity: "50000",
            daytrade_count: 0,
            pattern_day_trader: false,
          }),
      }) // account check for PDT
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            quote: { ap: 150.5, bp: 150.4, as: 100, bs: 200, t: "2026-01-01T00:00:00Z" },
            symbol: "AAPL",
          }),
      }) // quote fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "order-123",
            client_order_id: "client-123",
            status: "accepted",
            symbol: "AAPL",
            qty: "10",
            filled_qty: "0",
            side: "buy",
            type: "market",
            time_in_force: "day",
            limit_price: null,
            filled_avg_price: null,
            created_at: "2026-01-01T00:00:00Z",
            submitted_at: "2026-01-01T00:00:00Z",
          }),
      }); // order placement

    const tool = tools.get("alpaca_place_order")!;
    const result = (await tool.execute("call-1", {
      symbol: "AAPL",
      qty: 10,
      side: "buy",
      type: "market",
    })) as ToolResult;

    expect(result.content[0].text).toContain("Order placed successfully");
    expect(result.details?.orderId).toBe("order-123");
    expect(result.details?.status).toBe("accepted");
  });

  it("denies order when policy engine rejects", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "denied",
      reason: "daily spend limit exceeded",
      failedStep: "daily_spend",
      approvalMode: "auto",
    });

    // Mock account + quote fetches
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ equity: "50000", daytrade_count: 0, pattern_day_trader: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ quote: { ap: 150, bp: 149, as: 100, bs: 200, t: "" }, symbol: "AAPL" }),
      });

    const tool = tools.get("alpaca_place_order")!;
    const result = (await tool.execute("call-2", {
      symbol: "AAPL",
      qty: 10,
      side: "buy",
    })) as ToolResult;

    expect(result.content[0].text).toContain("Order denied");
    expect(result.details?.error).toBe("policy_denied");
    expect(result.details?.failedStep).toBe("daily_spend");
  });

  it("returns pending confirmation when approval mode is confirm", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "pending_confirmation",
      reason: "requires confirmation",
      approvalMode: "confirm",
      timeoutMs: 60000,
    });

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ equity: "50000", daytrade_count: 0, pattern_day_trader: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ quote: { ap: 100, bp: 99, as: 100, bs: 200, t: "" }, symbol: "AAPL" }),
      });

    const tool = tools.get("alpaca_place_order")!;
    const result = (await tool.execute("call-3", {
      symbol: "AAPL",
      qty: 5,
      side: "buy",
    })) as ToolResult;

    expect(result.content[0].text).toContain("requires confirm approval");
    expect(result.details?.status).toBe("pending_confirmation");
    expect(result.details?.approvalMode).toBe("confirm");
  });

  it("blocks orders when policy engine is not configured", async () => {
    // Re-register with no trading config
    tools.clear();
    const mockApi = {
      pluginConfig: { apiKeyId: "k", apiSecretKey: "s", mode: "paper" },
      tradingPolicyConfig: null,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerTool: vi.fn((def: ToolDef) => {
        tools.set(def.name, def);
      }),
      registerService: vi.fn(),
    };
    alpacaPlugin.register(mockApi as any);

    // Mock account fetch (PDT check still runs)
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ equity: "50000", daytrade_count: 0, pattern_day_trader: false }),
    });

    const tool = tools.get("alpaca_place_order")!;
    const result = (await tool.execute("call-4", {
      symbol: "AAPL",
      qty: 1,
      side: "buy",
    })) as ToolResult;

    expect(result.content[0].text).toContain("policy engine not configured");
    expect(result.details?.error).toBe("no_policy_engine");
  });

  it("blocks buy orders under PDT rule", async () => {
    // Mock account with low equity and 3 day trades
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          equity: "20000",
          daytrade_count: 3,
          pattern_day_trader: false,
        }),
    });

    const tool = tools.get("alpaca_place_order")!;
    const result = (await tool.execute("call-5", {
      symbol: "AAPL",
      qty: 1,
      side: "buy",
    })) as ToolResult;

    expect(result.content[0].text).toContain("PDT rule");
    expect(result.details?.error).toBe("pdt_blocked");
    expect(result.details?.daytradeCount).toBe(3);
  });

  it("cancels order successfully", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    });

    const tool = tools.get("alpaca_cancel_order")!;
    const result = (await tool.execute("call-6", {
      orderId: "order-to-cancel",
    })) as ToolResult;

    expect(result.content[0].text).toContain("cancelled successfully");
    expect(result.details?.status).toBe("cancelled");
  });

  it("places bracket order with stop-loss and take-profit", async () => {
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
          id: "bracket-order-123",
          symbol: "TSLA",
          side: "buy",
          qty: "5",
          type: "market",
          time_in_force: "day",
          status: "accepted",
          limit_price: null,
          filled_avg_price: null,
          created_at: "2026-01-01",
          submitted_at: "2026-01-01",
        }),
    });

    const tool = tools.get("alpaca_place_bracket_order")!;
    const result = (await tool.execute("call-7", {
      symbol: "TSLA",
      qty: 5,
      side: "buy",
      stop_loss_price: 180,
      take_profit_price: 220,
    })) as ToolResult;

    expect(result.content[0].text).toContain("Bracket order placed");
    expect(result.details?.orderId).toBe("bracket-order-123");
    expect(result.details?.stopLoss).toBe(180);
    expect(result.details?.takeProfit).toBe(220);
  });
});
