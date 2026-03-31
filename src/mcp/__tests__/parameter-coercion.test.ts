/**
 * Unit tests for MCP strict parameter validation.
 *
 * Covers: validateToolArgs, server integration, schema correctness,
 * type checking, enum membership, required fields, and protocol edge cases.
 */

import { describe, it, expect, vi } from "vitest";
import { validateToolArgs } from "../validate-args.js";
import { MCP_TOOLS } from "../tools.js";

// ── Mock all external trading modules (needed for server import) ─────

vi.mock("../../trading/policy-state.js", () => ({
  loadPolicyState: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../trading/realized-pnl.js", () => ({
  recordTradeFill: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../trading/kill-switch.js", () => ({
  activateKillSwitch: vi.fn().mockResolvedValue(undefined),
  deactivateKillSwitch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../trading/audit-log.js", () => ({
  readAuditEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../trading/strategies/registry.js", () => ({
  listStrategies: vi.fn().mockResolvedValue([]),
  getStrategy: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../trading/backtest/data-generator.js", () => ({
  generateDemoBars: vi.fn().mockReturnValue([]),
}));

vi.mock("../../trading/backtest/engine.js", () => ({
  runBacktest: vi.fn().mockResolvedValue({ metrics: {} }),
}));

import { createMcpSession } from "../server.js";
import type { JsonRpcRequest } from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function findTool(name: string) {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function req(method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("MCP parameter validation", () => {
  // ── 1. Core validation logic (validateToolArgs) ───────────────────

  describe("validateToolArgs", () => {
    it("returns error when string passed where number expected", () => {
      const tool = findTool("place_order");
      const result = validateToolArgs(tool, {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: "ten",
        orderType: "market",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Expected number");
        expect(result.error).toContain("quantity");
      }
    });

    it("returns error when required field is missing", () => {
      const tool = findTool("place_order");
      const result = validateToolArgs(tool, {
        extensionId: "alpaca",
        // symbol is missing
        side: "buy",
        quantity: 10,
        orderType: "market",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Missing required field");
        expect(result.error).toContain("symbol");
      }
    });

    it("returns error for invalid enum value", () => {
      const tool = findTool("place_order");
      const result = validateToolArgs(tool, {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "short",
        quantity: 10,
        orderType: "market",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Invalid value");
        expect(result.error).toContain("side");
        expect(result.error).toContain("short");
      }
    });

    it("returns valid for correct args", () => {
      const tool = findTool("place_order");
      const result = validateToolArgs(tool, {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 10,
        orderType: "market",
      });
      expect(result.valid).toBe(true);
    });

    it("allows extra fields that are not in the schema", () => {
      const tool = findTool("place_order");
      const result = validateToolArgs(tool, {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 10,
        orderType: "market",
        customTag: "my-tag",
        priority: 999,
      });
      expect(result.valid).toBe(true);
    });

    it("returns error when quantity is NaN", () => {
      const tool = findTool("place_order");
      const result = validateToolArgs(tool, {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: NaN,
        orderType: "market",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("NaN");
        expect(result.error).toContain("quantity");
      }
    });

    it("returns error when required field is null", () => {
      const tool = findTool("place_order");
      const result = validateToolArgs(tool, {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: null,
        orderType: "market",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Missing required field");
        expect(result.error).toContain("quantity");
      }
    });

    it("validates correct types pass through", () => {
      const tool = findTool("run_backtest");
      const result = validateToolArgs(tool, {
        strategyId: "sma-cross",
        symbol: "AAPL",
        days: 365,
        initialCapital: 10000,
      });
      expect(result.valid).toBe(true);
    });
  });

  // ── 2. Per-tool schema validation ─────────────────────────────────

  describe("validates all 8 tools' parameters", () => {
    it("get_trading_state — accepts empty args", () => {
      const result = validateToolArgs(findTool("get_trading_state"), {});
      expect(result.valid).toBe(true);
    });

    it("get_positions — accepts empty args", () => {
      const result = validateToolArgs(findTool("get_positions"), {});
      expect(result.valid).toBe(true);
    });

    it("place_order — rejects wrong orderType enum", () => {
      const result = validateToolArgs(findTool("place_order"), {
        extensionId: "alpaca",
        symbol: "AAPL",
        side: "buy",
        quantity: 5,
        orderType: "trailing_stop",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("orderType");
      }
    });

    it("toggle_kill_switch — accepts boolean active", () => {
      const result = validateToolArgs(findTool("toggle_kill_switch"), { active: true });
      expect(result.valid).toBe(true);
    });

    it("toggle_kill_switch — rejects string for boolean active", () => {
      const result = validateToolArgs(findTool("toggle_kill_switch"), { active: "true" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Expected boolean");
        expect(result.error).toContain("active");
      }
    });

    it("get_trade_history — rejects string for number limit", () => {
      const result = validateToolArgs(findTool("get_trade_history"), { limit: "fifty" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Expected number");
        expect(result.error).toContain("limit");
      }
    });

    it("get_risk_metrics — accepts empty args", () => {
      const result = validateToolArgs(findTool("get_risk_metrics"), {});
      expect(result.valid).toBe(true);
    });

    it("list_strategies — accepts empty args", () => {
      const result = validateToolArgs(findTool("list_strategies"), {});
      expect(result.valid).toBe(true);
    });

    it("run_backtest — rejects missing strategyId", () => {
      const result = validateToolArgs(findTool("run_backtest"), {});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Missing required field");
        expect(result.error).toContain("strategyId");
      }
    });

    it("run_backtest — rejects number for string strategyId", () => {
      const result = validateToolArgs(findTool("run_backtest"), { strategyId: 42 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Expected string");
        expect(result.error).toContain("strategyId");
      }
    });
  });

  // ── 3. Server integration — validation blocks bad calls ───────────

  describe("server integration", () => {
    it("returns isError when tools/call has invalid parameters", async () => {
      const session = createMcpSession({});
      const res = await session.handleRequest(
        req("tools/call", {
          name: "place_order",
          arguments: {
            extensionId: "alpaca",
            symbol: "AAPL",
            side: "buy",
            quantity: "not-a-number",
            orderType: "market",
          },
        }),
      );

      expect(res.error).toBeUndefined();
      const result = res.result as { content: { text: string }[]; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Invalid parameters");
    });

    it("allows tools/call with valid parameters", async () => {
      const session = createMcpSession({});
      const res = await session.handleRequest(
        req("tools/call", {
          name: "get_trading_state",
          arguments: {},
        }),
      );
      expect(res.error).toBeUndefined();
      const result = res.result as { isError?: boolean };
      expect(result.isError).toBeUndefined();
    });
  });

  // ── 4. Protocol edge cases ────────────────────────────────────────

  describe("protocol edge cases", () => {
    it("returns Method not found for unknown JSON-RPC method", async () => {
      const session = createMcpSession({});
      const res = await session.handleRequest(req("unknown/method"));
      expect(res.error?.code).toBe(-32601);
      expect(res.error?.message).toContain("Method not found");
    });

    it("returns isError for unknown tool name via tools/call", async () => {
      const session = createMcpSession({});
      const res = await session.handleRequest(
        req("tools/call", { name: "nonexistent_tool", arguments: {} }),
      );
      const result = res.result as { content: { text: string }[]; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown tool");
    });
  });
});
