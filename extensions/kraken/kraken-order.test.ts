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
  krakenConfigSchema: {
    parse: (v: unknown) => v,
  },
  BASE_URL: "https://api.kraken.com",
}));

import krakenPlugin from "./index.js";

type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };
type ToolResult = { content: { type: string; text: string }[]; details?: Record<string, unknown> };

describe("Kraken order flow", () => {
  let tools: Map<string, ToolDef>;
  const mockEvaluateOrder = _mockEvaluateOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Map();

    global.fetch = vi.fn();

    const mockApi = {
      pluginConfig: {
        apiKey: "test-kraken-key",
        apiSecret: Buffer.from("test-kraken-secret").toString("base64"),
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

    krakenPlugin.register(mockApi as any);
  });

  it("sends HMAC-SHA512 signed request with API-Key and API-Sign headers", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    // First: ticker fetch (public GET) for price estimation
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            error: [],
            result: {
              XXBTZUSD: {
                a: ["50000.00", "1", "1"],
                b: ["49999.00", "1", "1"],
                c: ["50000.00", "0.01"],
                v: ["100", "500"],
                p: ["49500", "49800"],
                t: [50, 200],
                l: ["48000", "47500"],
                h: ["51000", "51500"],
                o: "49000",
              },
            },
          }),
      })
      // Second: AddOrder (private POST)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            error: [],
            result: {
              descr: { order: "buy 0.5 XBTUSD @ market" },
              txid: ["TXID-001"],
            },
          }),
      });

    const tool = tools.get("kraken_place_order")!;
    await tool.execute("call-1", {
      pair: "XBTUSD",
      type: "buy",
      volume: 0.5,
    });

    // The second fetch call is the private AddOrder
    const addOrderCall = (global.fetch as any).mock.calls[1];
    const headers = addOrderCall[1].headers;
    expect(headers["API-Key"]).toBe("test-kraken-key");
    expect(headers["API-Sign"]).toBeDefined();
    expect(addOrderCall[1].method).toBe("POST");
  });

  it("warns about low liquidity when trades < 5", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    // Ticker with only 2 trades today
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            error: [],
            result: {
              XXBTZUSD: {
                a: ["50000.00", "1", "1"],
                b: ["49999.00", "1", "1"],
                c: ["50000.00", "0.01"],
                v: ["0.1", "0.5"],
                p: ["49500", "49800"],
                t: [2, 10], // only 2 trades today
                l: ["48000", "47500"],
                h: ["51000", "51500"],
                o: "49000",
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            error: [],
            result: {
              descr: { order: "buy 1 XBTUSD @ market" },
              txid: ["TXID-002"],
            },
          }),
      });

    const tool = tools.get("kraken_place_order")!;
    const result = (await tool.execute("call-2", {
      pair: "XBTUSD",
      type: "buy",
      volume: 1,
    })) as ToolResult;

    expect(result.details?.priceStaleWarning).toContain("Low liquidity");
    expect(result.content[0].text).toContain("Low liquidity");
  });

  it("includes leverage in order params when specified", async () => {
    mockEvaluateOrder.mockResolvedValue({
      outcome: "approved",
      reason: "all checks passed",
      approvalMode: "auto",
    });

    // AddOrder call (price provided, so no ticker fetch needed)
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          error: [],
          result: {
            descr: { order: "buy 1 XBTUSD @ limit 50000 with 3:1 leverage" },
            txid: ["TXID-003"],
          },
        }),
    });

    const tool = tools.get("kraken_place_order")!;
    await tool.execute("call-3", {
      pair: "XBTUSD",
      type: "buy",
      ordertype: "limit",
      volume: 1,
      price: 50000,
      leverage: "3:1",
    });

    // Verify leverage is in the POST body
    const fetchCall = (global.fetch as any).mock.calls[0];
    const body = fetchCall[1].body as string;
    expect(body).toContain("leverage=3%3A1"); // URL-encoded "3:1"
  });

  it("uses application/x-www-form-urlencoded for private requests", async () => {
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
          error: [],
          result: {
            descr: { order: "buy 0.1 XBTUSD @ limit 45000" },
            txid: ["TXID-004"],
          },
        }),
    });

    const tool = tools.get("kraken_place_order")!;
    await tool.execute("call-4", {
      pair: "XBTUSD",
      type: "buy",
      ordertype: "limit",
      volume: 0.1,
      price: 45000,
    });

    const fetchCall = (global.fetch as any).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });
});
