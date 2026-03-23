import { describe, it, expect, vi, beforeEach } from "vitest";

const _mockEvaluateOrder = vi.fn();
vi.mock("tigerpaw/trading", () => ({
  TradingPolicyEngine: function () {
    this.evaluateOrder = _mockEvaluateOrder;
  },
  writeAuditEntry: vi.fn().mockResolvedValue(undefined),
  updatePolicyState: vi.fn().mockResolvedValue({}),
  withPlatformPortfolio: vi.fn(() => ({})),
  autoActivateIfBreached: vi.fn().mockResolvedValue(false),
}));

vi.mock("./config.js", () => ({
  manifoldConfigSchema: {
    parse: (v: unknown) => v,
  },
  BASE_URL: "https://api.manifold.markets/v0",
}));

import { updatePolicyState } from "tigerpaw/trading";
import manifoldPlugin from "./index.js";

type ToolDef = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };
type ToolResult = { content: { type: string; text: string }[]; details?: Record<string, unknown> };

describe("Manifold order flow", () => {
  let tools: Map<string, ToolDef>;
  const mockEvaluateOrder = _mockEvaluateOrder;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new Map();

    global.fetch = vi.fn();

    const mockApi = {
      pluginConfig: {
        apiKey: "test-manifold-key",
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

    manifoldPlugin.register(mockApi as any);
  });

  it("places bet when policy engine approves", async () => {
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
          id: "bet-123",
          contractId: "contract-abc",
          amount: 100,
          outcome: "YES",
          shares: 142.5,
          probBefore: 0.55,
          probAfter: 0.58,
          createdTime: 1700000000000,
          isFilled: true,
        }),
    });

    const tool = tools.get("manifold_place_bet")!;
    const result = (await tool.execute("call-1", {
      contractId: "contract-abc",
      amount: 100,
      outcome: "YES",
    })) as ToolResult;

    expect(result.content[0].text).toContain("Bet placed successfully");
    expect(result.details?.betId).toBe("bet-123");
    expect(result.details?.outcome).toBe("YES");
  });

  it("does NOT add Mana to dailySpendUsd on buy (bug fix verification)", async () => {
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
          id: "bet-456",
          contractId: "contract-def",
          amount: 1000,
          outcome: "NO",
          shares: 1200,
          probBefore: 0.4,
          probAfter: 0.35,
          createdTime: 1700000000000,
          isFilled: true,
        }),
    });

    const tool = tools.get("manifold_place_bet")!;
    await tool.execute("call-2", {
      contractId: "contract-def",
      amount: 1000,
      outcome: "NO",
    });

    expect(updatePolicyState).toHaveBeenCalledTimes(1);
    const updaterFn = (updatePolicyState as any).mock.calls[0][0];
    const mockState = { dailyTradeCount: 3, dailySpendUsd: 50, lastTradeAtMs: 0 };
    const result = updaterFn(mockState);

    // Trade count should increment
    expect(result.dailyTradeCount).toBe(4);
    // dailySpendUsd should remain unchanged — Manifold uses Mana, not USD
    expect(result.dailySpendUsd).toBe(50);
  });

  it("does NOT add to dailySpendUsd on sell", async () => {
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
          id: "sell-789",
          contractId: "contract-ghi",
          amount: -500,
          outcome: "YES",
          shares: 600,
          probBefore: 0.6,
          probAfter: 0.57,
          createdTime: 1700000000000,
          isFilled: true,
        }),
    });

    const tool = tools.get("manifold_sell_shares")!;
    await tool.execute("call-3", {
      contractId: "contract-ghi",
      outcome: "YES",
      shares: 600,
    });

    expect(updatePolicyState).toHaveBeenCalledTimes(1);
    const updaterFn = (updatePolicyState as any).mock.calls[0][0];
    const mockState = { dailyTradeCount: 0, dailySpendUsd: 200, lastTradeAtMs: 0 };
    const result = updaterFn(mockState);

    expect(result.dailyTradeCount).toBe(1);
    // dailySpendUsd should remain unchanged on sell
    expect(result.dailySpendUsd).toBe(200);
  });
});
