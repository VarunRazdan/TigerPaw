/**
 * Unit tests for workflow router evaluators (if_else, switch, loop).
 *
 * Direct imports, no mocks needed.
 */

import { describe, it, expect } from "vitest";
import { ExecutionContext } from "../context.js";
import { evaluateRouter, supportedRouters } from "../routers.js";

describe("Router evaluators", () => {
  // ── if_else ──────────────────────────────────────────────────────

  describe("if_else", () => {
    it("returns 'true' for == when values match", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "AAPL", operator: "==", right: "AAPL" },
        ctx,
      );
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'false' for == when values differ", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "AAPL", operator: "==", right: "GOOG" },
        ctx,
      );
      expect(result.selectedOutput).toBe("false");
    });

    it("returns 'true' for != when values differ", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "AAPL", operator: "!=", right: "GOOG" },
        ctx,
      );
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for > with numeric comparison", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("if_else", { left: "100", operator: ">", right: "50" }, ctx);
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for >= with equal values", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("if_else", { left: "50", operator: ">=", right: "50" }, ctx);
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for < with lesser value", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("if_else", { left: "10", operator: "<", right: "50" }, ctx);
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for <= with equal values", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("if_else", { left: "50", operator: "<=", right: "50" }, ctx);
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for contains when substring present", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "hello world", operator: "contains", right: "world" },
        ctx,
      );
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for starts_with", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "hello world", operator: "starts_with", right: "hello" },
        ctx,
      );
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for ends_with", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "hello world", operator: "ends_with", right: "world" },
        ctx,
      );
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for matches with regex", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "order-123", operator: "matches", right: "order-\\d+" },
        ctx,
      );
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'false' for matches with invalid regex", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "test", operator: "matches", right: "[invalid" },
        ctx,
      );
      expect(result.selectedOutput).toBe("false");
    });

    it("returns 'true' for is_empty when value is empty string", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("if_else", { left: "", operator: "is_empty" }, ctx);
      expect(result.selectedOutput).toBe("true");
    });

    it("returns 'true' for is_not_empty when value is present", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("if_else", { left: "value", operator: "is_not_empty" }, ctx);
      expect(result.selectedOutput).toBe("true");
    });

    it("resolves $ prefix from context", () => {
      const ctx = new ExecutionContext({ order: { symbol: "AAPL" } });
      const result = evaluateRouter(
        "if_else",
        { left: "$order.symbol", operator: "==", right: "AAPL" },
        ctx,
      );
      expect(result.selectedOutput).toBe("true");
      expect(result.evaluatedValue).toBe("AAPL");
    });

    it("returns 'false' for unknown operator", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter(
        "if_else",
        { left: "a", operator: "unknown_op", right: "b" },
        ctx,
      );
      expect(result.selectedOutput).toBe("false");
    });
  });

  // ── switch ───────────────────────────────────────────────────────

  describe("switch", () => {
    const cases = [
      { value: "buy", output: "buy-branch" },
      { value: "sell", output: "sell-branch" },
    ];

    it("selects matching case output", () => {
      const ctx = new ExecutionContext({ side: "buy" });
      const result = evaluateRouter("switch", { field: "side", cases }, ctx);
      expect(result.selectedOutput).toBe("buy-branch");
    });

    it("returns fallback when no case matches", () => {
      const ctx = new ExecutionContext({ side: "hold" });
      const result = evaluateRouter("switch", { field: "side", cases, fallback: "other" }, ctx);
      expect(result.selectedOutput).toBe("other");
    });

    it("uses 'default' as fallback when none specified", () => {
      const ctx = new ExecutionContext({ side: "hold" });
      const result = evaluateRouter("switch", { field: "side", cases }, ctx);
      expect(result.selectedOutput).toBe("default");
    });

    it("resolves $ prefix for field value", () => {
      const ctx = new ExecutionContext({ order: { type: "sell" } });
      const result = evaluateRouter("switch", { field: "$order.type", cases }, ctx);
      expect(result.selectedOutput).toBe("sell-branch");
    });

    it("returns fallback when field is empty", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("switch", { field: "", cases, fallback: "none" }, ctx);
      expect(result.selectedOutput).toBe("none");
    });
  });

  // ── loop ─────────────────────────────────────────────────────────

  describe("loop", () => {
    it("returns 'loop' when array is non-empty", () => {
      const ctx = new ExecutionContext({ items: [1, 2, 3] });
      const result = evaluateRouter("loop", { arrayPath: "items" }, ctx);
      expect(result.selectedOutput).toBe("loop");
      expect(result.evaluatedValue).toEqual({ arrayLength: 3 });
    });

    it("returns 'done' when array is empty", () => {
      const ctx = new ExecutionContext({ items: [] });
      const result = evaluateRouter("loop", { arrayPath: "items" }, ctx);
      expect(result.selectedOutput).toBe("done");
      expect(result.evaluatedValue).toEqual({ arrayLength: 0 });
    });

    it("returns 'done' when arrayPath is empty string", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("loop", { arrayPath: "" }, ctx);
      expect(result.selectedOutput).toBe("done");
    });

    it("returns 'done' when value is not an array", () => {
      const ctx = new ExecutionContext({ items: "not-an-array" });
      const result = evaluateRouter("loop", { arrayPath: "items" }, ctx);
      expect(result.selectedOutput).toBe("done");
      expect(result.evaluatedValue).toEqual({ arrayLength: 0 });
    });

    it("resolves $ prefix for array path", () => {
      const ctx = new ExecutionContext({ data: { results: [1, 2] } });
      const result = evaluateRouter("loop", { arrayPath: "$data.results" }, ctx);
      expect(result.selectedOutput).toBe("loop");
    });
  });

  // ── evaluateRouter ────────────────────────────────────────────────

  describe("evaluateRouter", () => {
    it("returns 'default' for unknown router type", () => {
      const ctx = new ExecutionContext();
      const result = evaluateRouter("totally_unknown", {}, ctx);
      expect(result.selectedOutput).toBe("default");
    });

    it("returns 'default' on error", () => {
      // Force an error by passing a config that would cause a crash
      // (The try/catch in evaluateRouter should handle this gracefully)
      const ctx = new ExecutionContext();
      // A proxy that throws on property access simulates an error in the evaluator
      const badConfig = new Proxy(
        {},
        {
          get() {
            throw new Error("boom");
          },
        },
      );
      const result = evaluateRouter("if_else", badConfig as Record<string, unknown>, ctx);
      expect(result.selectedOutput).toBe("default");
    });
  });

  // ── supportedRouters ──────────────────────────────────────────────

  describe("supportedRouters", () => {
    it("returns all 3 router types", () => {
      const names = supportedRouters();
      expect(names).toContain("if_else");
      expect(names).toContain("switch");
      expect(names).toContain("loop");
      expect(names).toHaveLength(3);
    });
  });
});
