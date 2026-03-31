/**
 * Unit tests for workflow condition evaluators — gap coverage.
 *
 * Tests the 5 evaluators with direct imports (no mocks needed).
 */

import { describe, it, expect } from "vitest";
import { evaluateCondition, supportedConditions } from "../conditions.js";
import { ExecutionContext } from "../context.js";

describe("Condition evaluators (gap coverage)", () => {
  // ── contains_keyword ─────────────────────────────────────────────

  describe("contains_keyword", () => {
    it("returns true when keyword is found", () => {
      const ctx = new ExecutionContext({ text: "The quick brown fox" });
      expect(evaluateCondition("contains_keyword", { keyword: "quick" }, ctx)).toBe(true);
    });

    it("returns false when keyword is absent", () => {
      const ctx = new ExecutionContext({ text: "The quick brown fox" });
      expect(evaluateCondition("contains_keyword", { keyword: "zebra" }, ctx)).toBe(false);
    });

    it("is case-insensitive by default", () => {
      const ctx = new ExecutionContext({ text: "Hello World" });
      expect(evaluateCondition("contains_keyword", { keyword: "hello" }, ctx)).toBe(true);
    });

    it("is case-sensitive when caseSensitive flag is set", () => {
      const ctx = new ExecutionContext({ text: "Hello World" });
      expect(
        evaluateCondition("contains_keyword", { keyword: "hello", caseSensitive: true }, ctx),
      ).toBe(false);
    });

    it("falls back to message field when text is missing", () => {
      const ctx = new ExecutionContext({ message: "chat message here" });
      expect(evaluateCondition("contains_keyword", { keyword: "chat" }, ctx)).toBe(true);
    });

    it("falls back to preview field when text and message are missing", () => {
      const ctx = new ExecutionContext({ preview: "preview snippet" });
      expect(evaluateCondition("contains_keyword", { keyword: "snippet" }, ctx)).toBe(true);
    });

    it("returns false when keyword is empty", () => {
      const ctx = new ExecutionContext({ text: "anything" });
      expect(evaluateCondition("contains_keyword", {}, ctx)).toBe(false);
    });
  });

  // ── sender_matches ──────────────────────────────────────────────

  describe("sender_matches", () => {
    it("matches sender with regex", () => {
      const ctx = new ExecutionContext({ sender: "admin@company.com" });
      expect(evaluateCondition("sender_matches", { pattern: "admin@" }, ctx)).toBe(true);
    });

    it("falls back to author field", () => {
      const ctx = new ExecutionContext({ author: "bot-user" });
      expect(evaluateCondition("sender_matches", { pattern: "bot" }, ctx)).toBe(true);
    });

    it("returns false when pattern is empty", () => {
      const ctx = new ExecutionContext({ sender: "anyone" });
      expect(evaluateCondition("sender_matches", { pattern: "" }, ctx)).toBe(false);
    });

    it("falls back to includes when regex is invalid", () => {
      const ctx = new ExecutionContext({ sender: "user[test" });
      expect(evaluateCondition("sender_matches", { pattern: "[test" }, ctx)).toBe(true);
    });
  });

  // ── channel_is ──────────────────────────────────────────────────

  describe("channel_is", () => {
    it("matches channel case-insensitively", () => {
      const ctx = new ExecutionContext({ channel: "General" });
      expect(evaluateCondition("channel_is", { channel: "general" }, ctx)).toBe(true);
    });

    it("returns false when channel does not match", () => {
      const ctx = new ExecutionContext({ channel: "random" });
      expect(evaluateCondition("channel_is", { channel: "general" }, ctx)).toBe(false);
    });

    it("returns false when target channel is empty", () => {
      const ctx = new ExecutionContext({ channel: "general" });
      expect(evaluateCondition("channel_is", { channel: "" }, ctx)).toBe(false);
    });
  });

  // ── expression ───────────────────────────────────────────────────

  describe("expression", () => {
    it("evaluates == (string equality)", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition("expression", { left: "AAPL", operator: "==", right: "AAPL" }, ctx),
      ).toBe(true);
    });

    it("evaluates != (string inequality)", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition("expression", { left: "AAPL", operator: "!=", right: "GOOG" }, ctx),
      ).toBe(true);
    });

    it("evaluates > with numeric comparison", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition("expression", { left: "100", operator: ">", right: "50" }, ctx),
      ).toBe(true);
    });

    it("evaluates >= with equal values", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition("expression", { left: "50", operator: ">=", right: "50" }, ctx),
      ).toBe(true);
    });

    it("evaluates < with lesser value", () => {
      const ctx = new ExecutionContext();
      expect(evaluateCondition("expression", { left: "10", operator: "<", right: "50" }, ctx)).toBe(
        true,
      );
    });

    it("evaluates <= with equal values", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition("expression", { left: "50", operator: "<=", right: "50" }, ctx),
      ).toBe(true);
    });

    it("evaluates contains operator", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition(
          "expression",
          { left: "hello world", operator: "contains", right: "world" },
          ctx,
        ),
      ).toBe(true);
    });

    it("evaluates starts_with operator", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition(
          "expression",
          { left: "hello world", operator: "starts_with", right: "hello" },
          ctx,
        ),
      ).toBe(true);
    });

    it("evaluates ends_with operator", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition(
          "expression",
          { left: "hello world", operator: "ends_with", right: "world" },
          ctx,
        ),
      ).toBe(true);
    });

    it("evaluates matches with regex", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition(
          "expression",
          { left: "order-123", operator: "matches", right: "order-\\d+" },
          ctx,
        ),
      ).toBe(true);
    });

    it("returns false for invalid regex in matches", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition(
          "expression",
          { left: "text", operator: "matches", right: "[invalid" },
          ctx,
        ),
      ).toBe(false);
    });

    it("resolves $ prefix from context for left value", () => {
      const ctx = new ExecutionContext({ order: { symbol: "AAPL" } });
      expect(
        evaluateCondition(
          "expression",
          { left: "$order.symbol", operator: "==", right: "AAPL" },
          ctx,
        ),
      ).toBe(true);
    });

    it("resolves $ prefix from context for right value", () => {
      const ctx = new ExecutionContext({ threshold: "100" });
      expect(
        evaluateCondition("expression", { left: "150", operator: ">", right: "$threshold" }, ctx),
      ).toBe(true);
    });

    it("returns false for unknown operator", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition("expression", { left: "a", operator: "unknown_op", right: "b" }, ctx),
      ).toBe(false);
    });

    it("returns false for > when values are not numeric", () => {
      const ctx = new ExecutionContext();
      expect(
        evaluateCondition("expression", { left: "abc", operator: ">", right: "def" }, ctx),
      ).toBe(false);
    });
  });

  // ── evaluateCondition error handling ─────────────────────────────

  describe("evaluateCondition", () => {
    it("returns false for unknown subtype", () => {
      const ctx = new ExecutionContext();
      expect(evaluateCondition("totally_unknown", {}, ctx)).toBe(false);
    });

    it("returns false on error thrown by evaluator", () => {
      const ctx = new ExecutionContext();
      // Use a Proxy to force an error inside the evaluator
      const badConfig = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "keyword") {
              throw new Error("boom");
            }
            return undefined;
          },
        },
      );
      expect(evaluateCondition("contains_keyword", badConfig as Record<string, unknown>, ctx)).toBe(
        false,
      );
    });
  });

  // ── supportedConditions ──────────────────────────────────────────

  describe("supportedConditions", () => {
    it("returns all 5 evaluator keys", () => {
      const names = supportedConditions();
      expect(names).toContain("contains_keyword");
      expect(names).toContain("sender_matches");
      expect(names).toContain("channel_is");
      expect(names).toContain("time_of_day");
      expect(names).toContain("expression");
      expect(names).toHaveLength(5);
    });
  });
});
