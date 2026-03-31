/**
 * Unit tests for MCP tool parameter coercion and protocol edge cases.
 *
 * Covers: string-to-boolean/number coercion in tool handlers,
 * default value fallbacks, and protocol-level error responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external trading modules (same pattern as tools.test.ts) ──

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

import { createMcpSession } from "../server.js";
import { executeTool } from "../tools.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function defaultPolicyState() {
  return {
    date: "2026-03-31",
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    highWaterMarkUsd: 10_000,
    currentPortfolioValueUsd: 10_000,
    openPositionCount: 0,
    positionCountByPlatform: {},
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
  };
}

function parseResult(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

function getText(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0].text;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("MCP parameter coercion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadPolicyState.mockResolvedValue(defaultPolicyState());
    mockReadAuditEntries.mockResolvedValue([]);
    mockRecordTradeFill.mockResolvedValue({ dailyPnlUsd: 0, dailyTradeCount: 1 });
  });

  // ── toggle_kill_switch.active coercion ─────────────────────────────

  describe("toggle_kill_switch active coercion", () => {
    it('coerces string "true" to boolean true', async () => {
      mockActivateKillSwitch.mockResolvedValue(undefined);

      const result = await executeTool("toggle_kill_switch", { active: "true" });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.active).toBe(true);
      expect(mockActivateKillSwitch).toHaveBeenCalled();
      expect(mockDeactivateKillSwitch).not.toHaveBeenCalled();
    });

    it('coerces string "false" to boolean false', async () => {
      mockDeactivateKillSwitch.mockResolvedValue(undefined);

      const result = await executeTool("toggle_kill_switch", { active: "false" });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.active).toBe(false);
      expect(mockDeactivateKillSwitch).toHaveBeenCalled();
      expect(mockActivateKillSwitch).not.toHaveBeenCalled();
    });

    it('coerces "yes" to false (only "true" is truthy)', async () => {
      mockDeactivateKillSwitch.mockResolvedValue(undefined);

      const result = await executeTool("toggle_kill_switch", { active: "yes" });
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.active).toBe(false);
      expect(mockDeactivateKillSwitch).toHaveBeenCalled();
    });

    it("coerces undefined active to false", async () => {
      mockDeactivateKillSwitch.mockResolvedValue(undefined);

      const result = await executeTool("toggle_kill_switch", {});
      const parsed = parseResult(result) as Record<string, unknown>;

      expect(parsed.active).toBe(false);
      expect(mockDeactivateKillSwitch).toHaveBeenCalled();
    });
  });

  // ── place_order quantity coercion ──────────────────────────────────

  describe("place_order quantity coercion", () => {
    it("coerces string quantity to number", async () => {
      await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: "10",
        orderType: "market",
      });

      expect(mockRecordTradeFill).toHaveBeenCalledWith(expect.objectContaining({ quantity: 10 }));
    });

    it("NaN quantity passes validation (NaN <= 0 is false) and submits", async () => {
      const result = await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: "abc",
        orderType: "market",
      });

      // Number("abc") = NaN; NaN <= 0 evaluates to false, so the guard does not block
      const parsed = parseResult(result) as Record<string, unknown>;
      expect(parsed.status).toBe("submitted");
      expect(mockRecordTradeFill).toHaveBeenCalledWith(expect.objectContaining({ quantity: NaN }));
    });

    it("rejects null quantity (falls back to 0)", async () => {
      const result = await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: null,
        orderType: "market",
      });

      // null ?? 0 = 0, and 0 is not > 0
      expect(getText(result)).toContain("Error");
      expect(mockRecordTradeFill).not.toHaveBeenCalled();
    });

    it("coerces string limitPrice to number", async () => {
      await executeTool("place_order", {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 5,
        orderType: "limit",
        limitPrice: "150.50",
      });

      expect(mockRecordTradeFill).toHaveBeenCalledWith(
        expect.objectContaining({ executedPrice: 150.5 }),
      );
    });
  });

  // ── run_backtest parameter coercion ────────────────────────────────

  describe("run_backtest parameter coercion", () => {
    const mockStrategy = {
      id: "test-strat",
      name: "Test Strategy",
      enabled: true,
      symbols: ["AAPL"],
    };
    const mockBars = [{ open: 100, high: 105, low: 99, close: 103, volume: 1000 }];
    const mockBacktestResult = {
      metrics: {
        totalReturn: 10,
        sharpe: 1.2,
        sortino: 1.5,
        maxDrawdownPercent: 5,
        winRate: 60,
        totalTrades: 20,
        totalPnl: 1000,
      },
    };

    beforeEach(() => {
      mockGetStrategy.mockResolvedValue(mockStrategy);
      mockGenerateDemoBars.mockReturnValue(mockBars);
      mockRunBacktest.mockResolvedValue(mockBacktestResult);
    });

    it("coerces string initialCapital to number", async () => {
      await executeTool("run_backtest", {
        strategyId: "test-strat",
        initialCapital: "25000",
      });

      expect(mockRunBacktest).toHaveBeenCalledWith(
        mockStrategy,
        mockBars,
        expect.objectContaining({ initialCapitalUsd: 25_000 }),
      );
    });

    it("defaults initialCapital to 10000 when omitted", async () => {
      await executeTool("run_backtest", { strategyId: "test-strat" });

      expect(mockRunBacktest).toHaveBeenCalledWith(
        mockStrategy,
        mockBars,
        expect.objectContaining({ initialCapitalUsd: 10_000 }),
      );
    });

    it("coerces string days argument (uses symbol from strategy)", async () => {
      await executeTool("run_backtest", {
        strategyId: "test-strat",
        days: "30",
      });

      // days param is accepted but generateDemoBars is called with symbol
      expect(mockGenerateDemoBars).toHaveBeenCalledWith("AAPL");
    });
  });

  // ── get_trade_history limit coercion ───────────────────────────────

  describe("get_trade_history limit coercion", () => {
    beforeEach(() => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        timestamp: `2026-03-31T${String(i).padStart(2, "0")}:00:00Z`,
        action: "filled",
        extensionId: "alpaca",
        actor: "exchange",
        orderSnapshot: { symbol: "AAPL", side: "buy", quantity: 1 },
      }));
      mockReadAuditEntries.mockResolvedValue(entries);
    });

    it("coerces string limit to number", async () => {
      const result = await executeTool("get_trade_history", { limit: "5" });
      const parsed = parseResult(result) as { trades: unknown[]; total: number };

      expect(parsed.total).toBe(5);
    });

    it("uses NaN limit (returns all entries since slice(-NaN) returns full array)", async () => {
      const result = await executeTool("get_trade_history", { limit: "abc" });
      const parsed = parseResult(result) as { trades: unknown[]; total: number };

      // Number("abc") = NaN, slice(-NaN) = slice(0) = all entries
      expect(parsed.total).toBe(100);
    });

    it("defaults limit to 50 when omitted", async () => {
      const result = await executeTool("get_trade_history", {});
      const parsed = parseResult(result) as { trades: unknown[]; total: number };

      expect(parsed.total).toBe(50);
    });
  });

  // ── Protocol edge cases ────────────────────────────────────────────

  describe("protocol edge cases", () => {
    it("unknown method returns JSON-RPC error", async () => {
      const session = createMcpSession({});
      const response = await session.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "nonexistent/method",
      });

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
      expect(response.error!.message).toContain("Method not found");
    });

    it("resources/list returns empty resources array", async () => {
      const session = createMcpSession({});
      const response = await session.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/list",
      });

      expect(response.error).toBeUndefined();
      const result = response.result as { resources: unknown[] };
      expect(result.resources).toEqual([]);
    });

    it("prompts/list returns empty prompts array", async () => {
      const session = createMcpSession({});
      const response = await session.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "prompts/list",
      });

      expect(response.error).toBeUndefined();
      const result = response.result as { prompts: unknown[] };
      expect(result.prompts).toEqual([]);
    });

    it("unknown tool name returns isError in tools/call", async () => {
      const session = createMcpSession({});
      const response = await session.handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nonexistent_tool", arguments: {} },
      });

      expect(response.error).toBeUndefined();
      const result = response.result as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown tool");
    });
  });
});
