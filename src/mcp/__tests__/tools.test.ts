/**
 * Comprehensive unit tests for MCP tools.
 *
 * Covers: tool definitions, all 8 executeTool handlers, edge cases, error paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external trading modules ──────────────────────────────────

const mockLoadPolicyState = vi.fn();
vi.mock("../../trading/policy-state.js", () => ({
  loadPolicyState: (...args: unknown[]) => mockLoadPolicyState(...args),
}));

const mockRecordTradeFill = vi.fn();
vi.mock("../../trading/realized-pnl.js", () => ({
  recordTradeFill: (...args: unknown[]) => mockRecordTradeFill(...args),
}));

const mockActivateKillSwitch = vi.fn();
const mockDeactivateKillSwitch = vi.fn();
vi.mock("../../trading/kill-switch.js", () => ({
  activateKillSwitch: (...args: unknown[]) => mockActivateKillSwitch(...args),
  deactivateKillSwitch: (...args: unknown[]) => mockDeactivateKillSwitch(...args),
}));

const mockReadAuditEntries = vi.fn();
vi.mock("../../trading/audit-log.js", () => ({
  readAuditEntries: (...args: unknown[]) => mockReadAuditEntries(...args),
}));

const mockListStrategies = vi.fn();
const mockGetStrategy = vi.fn();
vi.mock("../../trading/strategies/registry.js", () => ({
  listStrategies: (...args: unknown[]) => mockListStrategies(...args),
  getStrategy: (...args: unknown[]) => mockGetStrategy(...args),
}));

const mockGenerateDemoBars = vi.fn();
vi.mock("../../trading/backtest/data-generator.js", () => ({
  generateDemoBars: (...args: unknown[]) => mockGenerateDemoBars(...args),
}));

const mockRunBacktest = vi.fn();
vi.mock("../../trading/backtest/engine.js", () => ({
  runBacktest: (...args: unknown[]) => mockRunBacktest(...args),
}));

import { MCP_TOOLS, executeTool } from "../tools.js";

// ── Helpers ────────────────────────────────────────────────────────────

function defaultPolicyState() {
  return {
    date: "2026-03-31",
    dailyPnlUsd: 150.5,
    dailySpendUsd: 500,
    dailyTradeCount: 12,
    consecutiveLosses: 1,
    highWaterMarkUsd: 50_000,
    currentPortfolioValueUsd: 48_000,
    openPositionCount: 3,
    positionCountByPlatform: { alpaca: 2, coinbase: 1 },
    positionsByAsset: {
      AAPL: { extensionId: "alpaca", valueUsd: 5000, percentOfPortfolio: 10.4 },
      "BTC-USD": { extensionId: "coinbase", valueUsd: 12000, percentOfPortfolio: 25 },
    },
    lastTradeAtMs: Date.now() - 60_000,
    killSwitch: { active: false },
  };
}

/** Parse the JSON from a tool result's first content item. */
function parseResult(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

/** Get raw text from a tool result. */
function getText(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0].text;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("MCP Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPolicyState.mockResolvedValue(defaultPolicyState());
    mockReadAuditEntries.mockResolvedValue([]);
  });

  // ── 1. Tool definitions ────────────────────────────────────────────

  describe("tool definitions", () => {
    it("defines exactly 8 tools", () => {
      expect(MCP_TOOLS).toHaveLength(8);
    });

    it("each tool has name, description, and inputSchema", () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.name).toEqual(expect.any(String));
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description).toEqual(expect.any(String));
        expect(tool.description.length).toBeGreaterThan(0);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it("place_order has required fields", () => {
      const placeOrder = MCP_TOOLS.find((t) => t.name === "place_order");
      expect(placeOrder).toBeDefined();
      expect(placeOrder!.inputSchema.required).toEqual(
        expect.arrayContaining(["extensionId", "symbol", "side", "quantity", "orderType"]),
      );
    });

    it("run_backtest requires strategyId", () => {
      const runBt = MCP_TOOLS.find((t) => t.name === "run_backtest");
      expect(runBt).toBeDefined();
      expect(runBt!.inputSchema.required).toContain("strategyId");
    });

    it("toggle_kill_switch requires active", () => {
      const toggle = MCP_TOOLS.find((t) => t.name === "toggle_kill_switch");
      expect(toggle).toBeDefined();
      expect(toggle!.inputSchema.required).toContain("active");
    });
  });

  // ── 2. get_trading_state ───────────────────────────────────────────

  describe("get_trading_state", () => {
    it("returns known state fields", async () => {
      const result = await executeTool("get_trading_state", {});
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.dailyPnlUsd).toBe(150.5);
      expect(parsed.dailySpendUsd).toBe(500);
      expect(parsed.dailyTradeCount).toBe(12);
      expect(parsed.consecutiveLosses).toBe(1);
      expect(parsed.highWaterMarkUsd).toBe(50_000);
      expect(parsed.currentPortfolioValueUsd).toBe(48_000);
      expect(parsed.killSwitch).toEqual({ active: false });
      expect(parsed.openPositionCount).toBe(3);
      expect(parsed.date).toBe("2026-03-31");
    });
  });

  // ── 3. get_positions ───────────────────────────────────────────────

  describe("get_positions", () => {
    it("returns positions from policy state", async () => {
      const result = await executeTool("get_positions", {});
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed).toHaveProperty("AAPL");
      expect(parsed).toHaveProperty("BTC-USD");
      expect((parsed.AAPL as Record<string, unknown>).valueUsd).toBe(5000);
    });

    it("returns empty object when no positions", async () => {
      mockLoadPolicyState.mockResolvedValue({
        ...defaultPolicyState(),
        positionsByAsset: undefined,
      });

      const result = await executeTool("get_positions", {});
      const parsed = parseResult(result);
      expect(parsed).toEqual({});
    });
  });

  // ── 4. place_order ─────────────────────────────────────────────────

  describe("place_order", () => {
    it("blocks order when kill switch is active", async () => {
      mockLoadPolicyState.mockResolvedValue({
        ...defaultPolicyState(),
        killSwitch: { active: true, mode: "hard", reason: "Emergency stop" },
      });

      const result = await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 10,
        orderType: "market",
      });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.status).toBe("blocked");
      expect(parsed.reason).toContain("Kill switch is active");
      expect(parsed.reason).toContain("Emergency stop");
      expect(mockRecordTradeFill).not.toHaveBeenCalled();
    });

    it("submits order when kill switch is inactive", async () => {
      mockRecordTradeFill.mockResolvedValue({
        dailyPnlUsd: 200,
        dailyTradeCount: 13,
      });

      const result = await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 5,
        orderType: "limit",
        limitPrice: 150.25,
      });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.status).toBe("submitted");
      expect(parsed.dailyPnlUsd).toBe(200);
      expect(parsed.dailyTradeCount).toBe(13);
      expect(mockRecordTradeFill).toHaveBeenCalledWith({
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 5,
        executedPrice: 150.25,
        realizedPnl: 0,
      });
    });

    it("returns error when required fields are missing", async () => {
      const result = await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "",
        side: "buy",
        quantity: 1,
        orderType: "market",
      });

      expect(getText(result)).toContain("Error");
      expect(getText(result)).toContain("required");
      expect(mockRecordTradeFill).not.toHaveBeenCalled();
    });

    it("returns error when quantity is zero", async () => {
      const result = await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 0,
        orderType: "market",
      });

      expect(getText(result)).toContain("Error");
      expect(mockRecordTradeFill).not.toHaveBeenCalled();
    });

    it("blocks when daily trade count is at limit (100)", async () => {
      mockLoadPolicyState.mockResolvedValue({
        ...defaultPolicyState(),
        dailyTradeCount: 100,
      });

      const result = await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 1,
        orderType: "market",
      });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.status).toBe("blocked");
      expect(parsed.reason).toContain("Daily trade limit");
      expect(mockRecordTradeFill).not.toHaveBeenCalled();
    });

    it("uses 0 as executedPrice when limitPrice not provided", async () => {
      mockRecordTradeFill.mockResolvedValue({
        dailyPnlUsd: 0,
        dailyTradeCount: 1,
      });

      await executeTool("place_order", {
        extensionId: "coinbase",
        symbol: "ETH-USD",
        side: "sell",
        quantity: 2,
        orderType: "market",
      });

      expect(mockRecordTradeFill).toHaveBeenCalledWith(
        expect.objectContaining({ executedPrice: 0 }),
      );
    });
  });

  // ── 5. toggle_kill_switch ──────────────────────────────────────────

  describe("toggle_kill_switch", () => {
    it("activates kill switch with correct args", async () => {
      mockActivateKillSwitch.mockResolvedValue(undefined);

      const result = await executeTool("toggle_kill_switch", {
        active: "true",
        reason: "Risk limit breached",
        mode: "soft",
      });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.active).toBe(true);
      expect(parsed.mode).toBe("soft");
      expect(parsed.reason).toBe("Risk limit breached");
      expect(mockActivateKillSwitch).toHaveBeenCalledWith(
        "Risk limit breached",
        "operator",
        "soft",
      );
      expect(mockDeactivateKillSwitch).not.toHaveBeenCalled();
    });

    it("deactivates kill switch", async () => {
      mockDeactivateKillSwitch.mockResolvedValue(undefined);

      const result = await executeTool("toggle_kill_switch", {
        active: "false",
      });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.active).toBe(false);
      expect(mockDeactivateKillSwitch).toHaveBeenCalledWith("operator");
      expect(mockActivateKillSwitch).not.toHaveBeenCalled();
    });

    it("defaults to hard mode and generic reason", async () => {
      mockActivateKillSwitch.mockResolvedValue(undefined);

      const result = await executeTool("toggle_kill_switch", { active: "true" });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.mode).toBe("hard");
      expect(parsed.reason).toBe("Toggled via MCP");
      expect(mockActivateKillSwitch).toHaveBeenCalledWith("Toggled via MCP", "operator", "hard");
    });
  });

  // ── 6. get_trade_history ───────────────────────────────────────────

  describe("get_trade_history", () => {
    it("filters and returns trade-related audit entries", async () => {
      mockReadAuditEntries.mockResolvedValue([
        {
          timestamp: "2026-03-31T10:00:00Z",
          action: "auto_approved",
          extensionId: "alpaca",
          actor: "policy_engine",
          orderSnapshot: { symbol: "AAPL", side: "buy", quantity: 10 },
        },
        {
          timestamp: "2026-03-31T10:01:00Z",
          action: "config_updated",
          extensionId: "system",
          actor: "operator",
        },
        {
          timestamp: "2026-03-31T10:02:00Z",
          action: "filled",
          extensionId: "alpaca",
          actor: "exchange",
          orderSnapshot: { symbol: "AAPL", side: "buy", quantity: 10 },
        },
        {
          timestamp: "2026-03-31T10:03:00Z",
          action: "denied",
          extensionId: "coinbase",
          actor: "policy_engine",
          orderSnapshot: { symbol: "BTC-USD", side: "sell", quantity: 0.5 },
          error: "Kill switch active",
        },
      ]);

      const result = await executeTool("get_trade_history", {});
      const parsed = parseResult(result) as {
        trades: Array<Record<string, unknown>>;
        total: number;
      };

      // "config_updated" should be filtered out
      expect(parsed.total).toBe(3);
      expect(parsed.trades).toHaveLength(3);
      expect(parsed.trades[0].action).toBe("auto_approved");
      expect(parsed.trades[0].symbol).toBe("AAPL");
      expect(parsed.trades[2].error).toBe("Kill switch active");
    });

    it("respects the limit parameter", async () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        timestamp: `2026-03-31T${String(i).padStart(2, "0")}:00:00Z`,
        action: "filled",
        extensionId: "alpaca",
        actor: "exchange",
        orderSnapshot: { symbol: "AAPL", side: "buy", quantity: 1 },
      }));
      mockReadAuditEntries.mockResolvedValue(entries);

      const result = await executeTool("get_trade_history", { limit: 3 });
      const parsed = parseResult(result) as { trades: unknown[]; total: number };

      // slice(-3) returns last 3 entries
      expect(parsed.total).toBe(3);
      expect(parsed.trades).toHaveLength(3);
    });

    it("handles entry with missing orderSnapshot gracefully", async () => {
      mockReadAuditEntries.mockResolvedValue([
        {
          timestamp: "2026-03-31T10:00:00Z",
          action: "submitted",
          extensionId: "alpaca",
          actor: "operator",
          // no orderSnapshot
        },
      ]);

      const result = await executeTool("get_trade_history", {});
      const parsed = parseResult(result) as { trades: Array<Record<string, unknown>> };

      expect(parsed.trades[0].symbol).toBe("unknown");
      expect(parsed.trades[0].side).toBeUndefined();
    });
  });

  // ── 7. get_risk_metrics ────────────────────────────────────────────

  describe("get_risk_metrics", () => {
    it("returns risk-related state fields with computed drawdown", async () => {
      mockReadAuditEntries.mockResolvedValue([
        { action: "filled", extensionId: "alpaca", timestamp: "2026-03-31T10:00:00Z" },
        { action: "filled", extensionId: "alpaca", timestamp: "2026-03-31T11:00:00Z" },
        { action: "config_updated", extensionId: "system", timestamp: "2026-03-31T12:00:00Z" },
      ]);

      const result = await executeTool("get_risk_metrics", {});
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.dailyPnlUsd).toBe(150.5);
      expect(parsed.highWaterMarkUsd).toBe(50_000);
      expect(parsed.currentPortfolioValueUsd).toBe(48_000);
      expect(parsed.consecutiveLosses).toBe(1);
      expect(parsed.killSwitchActive).toBe(false);
      // Drawdown: (50000 - 48000) / 50000 * 100 = 4%
      expect(parsed.currentDrawdownUsd).toBe(2000);
      expect(parsed.currentDrawdownPercent).toBe(4);
      // Only "filled" entries are counted
      expect(parsed.totalTradesRecorded).toBe(2);
      expect(parsed.note).toEqual(expect.any(String));
    });

    it("reflects negative drawdown state correctly", async () => {
      mockLoadPolicyState.mockResolvedValue({
        ...defaultPolicyState(),
        dailyPnlUsd: -2500,
        highWaterMarkUsd: 50_000,
        currentPortfolioValueUsd: 42_000,
        consecutiveLosses: 5,
      });

      const result = await executeTool("get_risk_metrics", {});
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.dailyPnlUsd).toBe(-2500);
      expect(parsed.currentPortfolioValueUsd).toBe(42_000);
      expect(parsed.consecutiveLosses).toBe(5);
      // Drawdown: (50000 - 42000) / 50000 * 100 = 16%
      expect(parsed.currentDrawdownUsd).toBe(8000);
      expect(parsed.currentDrawdownPercent).toBeCloseTo(16, 2);
    });

    it("clamps drawdown to zero when portfolio is above high water mark", async () => {
      mockLoadPolicyState.mockResolvedValue({
        ...defaultPolicyState(),
        highWaterMarkUsd: 50_000,
        currentPortfolioValueUsd: 55_000,
      });

      const result = await executeTool("get_risk_metrics", {});
      const parsed = parseResult(result) as Record<string, unknown>;

      // Portfolio above high water mark — drawdown should be clamped to 0
      expect(parsed.currentDrawdownUsd).toBe(0);
      expect(parsed.currentDrawdownPercent).toBe(0);
    });
  });

  // ── 8. list_strategies ─────────────────────────────────────────────

  describe("list_strategies", () => {
    it("returns strategies with expected fields", async () => {
      mockListStrategies.mockResolvedValue([
        {
          id: "sma-cross",
          name: "SMA Crossover",
          enabled: true,
          symbols: ["AAPL", "MSFT"],
          totalTrades: 42,
          winRate: 0.62,
          totalPnlUsd: 1200,
          lastExecutedAt: "2026-03-30T18:00:00Z",
          extraField: "ignored",
        },
        {
          id: "rsi-mean-rev",
          name: "RSI Mean Reversion",
          enabled: false,
          symbols: ["BTC-USD"],
          totalTrades: 10,
          winRate: 0.5,
          totalPnlUsd: -100,
          lastExecutedAt: null,
        },
      ]);

      const result = await executeTool("list_strategies", {});
      const parsed = parseResult(result) as Array<Record<string, unknown>>;

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({
        id: "sma-cross",
        name: "SMA Crossover",
        enabled: true,
        symbols: ["AAPL", "MSFT"],
        totalTrades: 42,
        winRate: 0.62,
        totalPnlUsd: 1200,
        lastExecutedAt: "2026-03-30T18:00:00Z",
      });
      // extraField should NOT be present
      expect(parsed[0]).not.toHaveProperty("extraField");
      expect(parsed[1].enabled).toBe(false);
    });
  });

  // ── 9. run_backtest ────────────────────────────────────────────────

  describe("run_backtest", () => {
    const mockStrategy = {
      id: "sma-cross",
      name: "SMA Crossover",
      enabled: true,
      symbols: ["AAPL"],
    };

    const mockBars = [{ open: 100, high: 105, low: 99, close: 103, volume: 1000 }];

    const mockBacktestResult = {
      metrics: {
        totalReturn: 15.23,
        sharpe: 1.45,
        sortino: 2.1,
        maxDrawdownPercent: 8.5,
        winRate: 62.5,
        totalTrades: 50,
        totalPnl: 1523.0,
      },
    };

    it("runs backtest and returns formatted metrics", async () => {
      mockGetStrategy.mockResolvedValue(mockStrategy);
      mockGenerateDemoBars.mockReturnValue(mockBars);
      mockRunBacktest.mockResolvedValue(mockBacktestResult);

      const result = await executeTool("run_backtest", {
        strategyId: "sma-cross",
        symbol: "AAPL",
        days: 365,
        initialCapital: 10000,
      });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.totalReturn).toBe("15.23%");
      expect(parsed.sharpe).toBe("1.45");
      expect(parsed.sortino).toBe("2.10");
      expect(parsed.maxDrawdown).toBe("8.50%");
      expect(parsed.winRate).toBe("62.5%");
      expect(parsed.totalTrades).toBe(50);
      expect(parsed.totalPnl).toBe("$1523.00");

      expect(mockGetStrategy).toHaveBeenCalledWith("sma-cross");
      expect(mockGenerateDemoBars).toHaveBeenCalledWith("AAPL");
      expect(mockRunBacktest).toHaveBeenCalledWith(
        mockStrategy,
        mockBars,
        expect.objectContaining({
          strategyId: "sma-cross",
          symbol: "AAPL",
          initialCapitalUsd: 10000,
          commissionPercent: 0.1,
          slippageBps: 5,
        }),
      );
    });

    it("returns error when strategyId is missing", async () => {
      const result = await executeTool("run_backtest", {});

      expect(getText(result)).toContain("Error");
      expect(getText(result)).toContain("strategyId is required");
      expect(mockGetStrategy).not.toHaveBeenCalled();
    });

    it("returns error when strategy is not found", async () => {
      mockGetStrategy.mockResolvedValue(null);

      const result = await executeTool("run_backtest", { strategyId: "nonexistent" });

      expect(getText(result)).toContain("Error");
      expect(getText(result)).toContain("Strategy not found");
      expect(getText(result)).toContain("nonexistent");
      expect(mockGenerateDemoBars).not.toHaveBeenCalled();
    });

    it("falls back to strategy's first symbol when symbol arg is omitted", async () => {
      mockGetStrategy.mockResolvedValue({
        ...mockStrategy,
        symbols: ["MSFT", "GOOGL"],
      });
      mockGenerateDemoBars.mockReturnValue(mockBars);
      mockRunBacktest.mockResolvedValue(mockBacktestResult);

      await executeTool("run_backtest", { strategyId: "sma-cross" });

      expect(mockGenerateDemoBars).toHaveBeenCalledWith("MSFT");
    });

    it("handles N/A sharpe/sortino when undefined", async () => {
      mockGetStrategy.mockResolvedValue(mockStrategy);
      mockGenerateDemoBars.mockReturnValue(mockBars);
      mockRunBacktest.mockResolvedValue({
        metrics: {
          ...mockBacktestResult.metrics,
          sharpe: undefined,
          sortino: undefined,
        },
      });

      const result = await executeTool("run_backtest", { strategyId: "sma-cross" });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.sharpe).toBe("N/A");
      expect(parsed.sortino).toBe("N/A");
    });
  });

  // ── 10. Unknown tool ───────────────────────────────────────────────

  describe("unknown tool", () => {
    it("returns error text for unrecognized tool name", async () => {
      const result = await executeTool("nonexistent_tool", {});

      expect(getText(result)).toBe("Unknown tool: nonexistent_tool");
    });

    it("returns error for empty tool name", async () => {
      const result = await executeTool("", {});

      expect(getText(result)).toBe("Unknown tool: ");
    });
  });
});
