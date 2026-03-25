import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(
    () => "-----BEGIN RSA PRIVATE KEY-----\nfake-key\n-----END RSA PRIVATE KEY-----",
  ),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomUUID: actual.randomUUID,
    createSign: vi.fn(() => ({
      update: vi.fn(),
      end: vi.fn(),
      sign: vi.fn(() => "fake-signature-base64"),
    })),
  };
});

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
  kalshiConfigSchema: {
    parse: (v: unknown) => v,
  },
  getBaseUrl: () => "https://demo-api.kalshi.co/trade-api/v2",
}));

import { updatePolicyState } from "tigerpaw/trading";
import kalshiPlugin from "./index.js";

type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };
type ToolResult = { content: { type: string; text: string }[]; details?: Record<string, unknown> };

describe("Kalshi order flow", () => {
  let tools: Map<string, ToolDef>;
  const mockEvaluateOrder = _mockEvaluateOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Map();

    global.fetch = vi.fn();

    const mockApi = {
      pluginConfig: {
        email: "test@example.com",
        apiKeyId: "test-kalshi-key",
        privateKeyPath: "/fake/path/key.pem",
        mode: "demo",
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

    kalshiPlugin.register(mockApi as any);
  });

  it("sends RSA-SHA256 signed headers with order request", async () => {
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
          order: {
            order_id: "kalshi-order-1",
            ticker: "KXBTC-25MAR14-T99999",
            status: "resting",
            side: "yes",
            type: "market",
            yes_price: 55,
            no_price: 45,
            created_time: "2026-01-01T00:00:00Z",
            remaining_count: 0,
          },
        }),
    });

    const tool = tools.get("kalshi_place_order")!;
    await tool.execute("call-1", {
      ticker: "KXBTC-25MAR14-T99999",
      side: "yes",
      count: 10,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["KALSHI-ACCESS-KEY"]).toBe("test-kalshi-key");
    expect(headers["KALSHI-ACCESS-SIGNATURE"]).toBeDefined();
    expect(headers["KALSHI-ACCESS-TIMESTAMP"]).toBeDefined();
  });

  it("includes 2% settlement fee in daily spend tracking", async () => {
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
          order: {
            order_id: "kalshi-order-2",
            ticker: "KXELECTION-YES",
            status: "resting",
            side: "yes",
            type: "market",
            yes_price: 60,
            no_price: 40,
            created_time: "2026-01-01",
            remaining_count: 0,
          },
        }),
    });

    const tool = tools.get("kalshi_place_order")!;
    await tool.execute("call-2", {
      ticker: "KXELECTION-YES",
      side: "yes",
      count: 10,
      yes_price: 60,
    });

    expect(updatePolicyState).toHaveBeenCalledTimes(1);
    const updaterFn = (updatePolicyState as any).mock.calls[0][0];
    const mockState = { dailyTradeCount: 0, dailySpendUsd: 0, lastTradeAtMs: 0 };
    const result = updaterFn(mockState);
    // 10 contracts * 0.60 USD (60 cents) * 1.02 (2% fee) = 6.12
    expect(result.dailySpendUsd).toBeCloseTo(6.12, 1);
    expect(result.dailyTradeCount).toBe(1);
  });

  it("tracks spend for both yes and no sides", async () => {
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
          order: {
            order_id: "kalshi-order-3",
            ticker: "KXBTC-T100K",
            status: "resting",
            side: "no",
            type: "market",
            yes_price: 70,
            no_price: 30,
            created_time: "2026-01-01",
            remaining_count: 0,
          },
        }),
    });

    const tool = tools.get("kalshi_place_order")!;
    await tool.execute("call-3", {
      ticker: "KXBTC-T100K",
      side: "no",
      count: 5,
      no_price: 30,
    });

    // Both yes and no sides should add to daily spend
    expect(updatePolicyState).toHaveBeenCalledTimes(1);
    const updaterFn = (updatePolicyState as any).mock.calls[0][0];
    const mockState = { dailyTradeCount: 0, dailySpendUsd: 0, lastTradeAtMs: 0 };
    const result = updaterFn(mockState);
    // 5 contracts * 0.30 USD * 1.02 = 1.53
    expect(result.dailySpendUsd).toBeCloseTo(1.53, 1);
  });

  it("converts cents to USD for policy evaluation", async () => {
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
          order: {
            order_id: "kalshi-order-4",
            ticker: "KXTEST",
            status: "resting",
            side: "yes",
            type: "limit",
            yes_price: 75,
            no_price: 25,
            created_time: "2026-01-01",
            remaining_count: 0,
          },
        }),
    });

    const tool = tools.get("kalshi_place_order")!;
    await tool.execute("call-4", {
      ticker: "KXTEST",
      side: "yes",
      count: 100,
      type: "limit",
      yes_price: 75,
    });

    // Verify evaluateOrder was called with price in USD (0.75), not cents (75)
    expect(mockEvaluateOrder).toHaveBeenCalledTimes(1);
    const orderArg = mockEvaluateOrder.mock.calls[0][0];
    expect(orderArg.priceUsd).toBe(0.75);
    expect(orderArg.notionalUsd).toBe(75); // 100 * 0.75
  });
});
