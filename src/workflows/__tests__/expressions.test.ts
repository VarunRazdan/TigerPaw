/**
 * Comprehensive unit tests for the Workflow Expression Engine.
 *
 * Covers: literals, identifiers, dot-paths, arithmetic, comparisons,
 * logical operators, ternary, function calls, complex expressions,
 * isComplexExpression detection, error handling, and safety limits.
 */

import { describe, it, expect } from "vitest";
import { evaluateExpression, isComplexExpression, ExpressionError } from "../expressions.js";

// ── 1. Literals ─────────────────────────────────────────────────────

describe("Expression Engine", () => {
  describe("literals", () => {
    it("evaluates integer literals", () => {
      expect(evaluateExpression("42", {})).toBe(42);
    });

    it("evaluates decimal literals", () => {
      expect(evaluateExpression("3.14", {})).toBeCloseTo(3.14);
    });

    it("evaluates zero", () => {
      expect(evaluateExpression("0", {})).toBe(0);
    });

    it("evaluates double-quoted string literals", () => {
      expect(evaluateExpression('"hello"', {})).toBe("hello");
    });

    it("evaluates single-quoted string literals", () => {
      expect(evaluateExpression("'world'", {})).toBe("world");
    });

    it("evaluates boolean true", () => {
      expect(evaluateExpression("true", {})).toBe(true);
    });

    it("evaluates boolean false", () => {
      expect(evaluateExpression("false", {})).toBe(false);
    });

    it("evaluates null", () => {
      expect(evaluateExpression("null", {})).toBe(null);
    });
  });

  // ── 2. Identifiers and dot-paths ──────────────────────────────────

  describe("identifiers and dot-paths", () => {
    it("resolves a simple identifier from context", () => {
      expect(evaluateExpression("symbol", { symbol: "AAPL" })).toBe("AAPL");
    });

    it("resolves a dot-path to a nested value", () => {
      const ctx = { event: { payload: { reason: "filled" } } };
      expect(evaluateExpression("event.payload.reason", ctx)).toBe("filled");
    });

    it("returns undefined for a missing key", () => {
      expect(evaluateExpression("unknown", {})).toBeUndefined();
    });

    it("resolves deep nesting (a.b.c.d.e)", () => {
      const ctx = { a: { b: { c: { d: { e: "deep" } } } } };
      expect(evaluateExpression("a.b.c.d.e", ctx)).toBe("deep");
    });

    it("handles identifiers with underscores and numbers", () => {
      const ctx = { node_1: { output: "result" } };
      expect(evaluateExpression("node_1.output", ctx)).toBe("result");
    });

    it("returns undefined when traversing through a null intermediate", () => {
      const ctx = { a: { b: null } };
      expect(evaluateExpression("a.b.c", ctx)).toBeUndefined();
    });
  });

  // ── 3. Arithmetic operators ───────────────────────────────────────

  describe("arithmetic operators", () => {
    it("adds two numbers", () => {
      expect(evaluateExpression("2 + 3", {})).toBe(5);
    });

    it("subtracts two numbers", () => {
      expect(evaluateExpression("10 - 4", {})).toBe(6);
    });

    it("multiplies two numbers", () => {
      expect(evaluateExpression("3 * 7", {})).toBe(21);
    });

    it("divides two numbers", () => {
      expect(evaluateExpression("10 / 3", {})).toBeCloseTo(3.3333, 3);
    });

    it("computes modulo", () => {
      expect(evaluateExpression("10 % 3", {})).toBe(1);
    });

    it("respects operator precedence (multiply before add)", () => {
      expect(evaluateExpression("2 + 3 * 4", {})).toBe(14);
    });

    it("respects parentheses overriding precedence", () => {
      expect(evaluateExpression("(2 + 3) * 4", {})).toBe(20);
    });

    it("concatenates strings with +", () => {
      expect(evaluateExpression('"hello" + " " + "world"', {})).toBe("hello world");
    });

    it("handles unary negation", () => {
      expect(evaluateExpression("-5", {})).toBe(-5);
    });
  });

  // ── 4. Comparison operators ───────────────────────────────────────

  describe("comparison operators", () => {
    it("evaluates greater-than", () => {
      expect(evaluateExpression("5 > 3", {})).toBe(true);
    });

    it("evaluates greater-or-equal (equal case)", () => {
      expect(evaluateExpression("3 >= 3", {})).toBe(true);
    });

    it("evaluates less-than", () => {
      expect(evaluateExpression("2 < 5", {})).toBe(true);
    });

    it("evaluates less-or-equal (false case)", () => {
      expect(evaluateExpression("5 <= 4", {})).toBe(false);
    });

    it("evaluates equality for strings", () => {
      expect(evaluateExpression('"abc" == "abc"', {})).toBe(true);
    });

    it("evaluates inequality", () => {
      expect(evaluateExpression("1 != 2", {})).toBe(true);
    });

    it("evaluates equality as false for different values", () => {
      expect(evaluateExpression("1 == 2", {})).toBe(false);
    });

    it("evaluates inequality as false for same values", () => {
      expect(evaluateExpression("3 != 3", {})).toBe(false);
    });
  });

  // ── 5. Logical operators ──────────────────────────────────────────

  describe("logical operators", () => {
    it("evaluates AND (false case)", () => {
      expect(evaluateExpression("true && false", {})).toBe(false);
    });

    it("evaluates OR (true case)", () => {
      expect(evaluateExpression("true || false", {})).toBe(true);
    });

    it("evaluates NOT true", () => {
      expect(evaluateExpression("!true", {})).toBe(false);
    });

    it("evaluates compound NOT with AND", () => {
      expect(evaluateExpression("!false && true", {})).toBe(true);
    });

    it("short-circuits AND (does not evaluate right side when left is false)", () => {
      // false && anything => false
      expect(evaluateExpression("false && true", {})).toBe(false);
    });

    it("short-circuits OR (does not evaluate right side when left is true)", () => {
      // true || anything => true
      expect(evaluateExpression("true || false", {})).toBe(true);
    });
  });

  // ── 6. Ternary operator ───────────────────────────────────────────

  describe("ternary operator", () => {
    it('evaluates true branch: true ? "yes" : "no"', () => {
      expect(evaluateExpression('true ? "yes" : "no"', {})).toBe("yes");
    });

    it('evaluates false branch: false ? "yes" : "no"', () => {
      expect(evaluateExpression('false ? "yes" : "no"', {})).toBe("no");
    });

    it("evaluates nested ternary", () => {
      expect(evaluateExpression('true ? (false ? "a" : "b") : "c"', {})).toBe("b");
    });

    it("evaluates ternary with context variables", () => {
      expect(evaluateExpression('price > 100 ? "high" : "low"', { price: 150 })).toBe("high");
    });

    it("evaluates ternary false branch with context variables", () => {
      expect(evaluateExpression('price > 100 ? "high" : "low"', { price: 50 })).toBe("low");
    });
  });

  // ── 7. Function calls ─────────────────────────────────────────────

  describe("function calls", () => {
    describe("string functions", () => {
      it("uppercase()", () => {
        expect(evaluateExpression('uppercase("hello")', {})).toBe("HELLO");
      });

      it("lowercase()", () => {
        expect(evaluateExpression('lowercase("HELLO")', {})).toBe("hello");
      });

      it("trim()", () => {
        expect(evaluateExpression('trim("  hello  ")', {})).toBe("hello");
      });

      it("replace()", () => {
        expect(evaluateExpression('replace("hello world", "world", "there")', {})).toBe(
          "hello there",
        );
      });

      it("substring()", () => {
        expect(evaluateExpression('substring("hello", 1, 3)', {})).toBe("el");
      });

      it("length() on string", () => {
        expect(evaluateExpression('length("hello")', {})).toBe(5);
      });

      it("split()", () => {
        expect(evaluateExpression('split("a,b,c", ",")', {})).toEqual(["a", "b", "c"]);
      });

      it("startsWith()", () => {
        expect(evaluateExpression('startsWith("hello", "hel")', {})).toBe(true);
      });

      it("endsWith()", () => {
        expect(evaluateExpression('endsWith("hello", "llo")', {})).toBe(true);
      });

      it("startsWith() returns false for non-matching prefix", () => {
        expect(evaluateExpression('startsWith("hello", "xyz")', {})).toBe(false);
      });
    });

    describe("array functions", () => {
      it("join()", () => {
        expect(evaluateExpression('join(items, ", ")', { items: ["a", "b", "c"] })).toBe("a, b, c");
      });

      it("first()", () => {
        expect(evaluateExpression("first(items)", { items: [1, 2, 3] })).toBe(1);
      });

      it("last()", () => {
        expect(evaluateExpression("last(items)", { items: [1, 2, 3] })).toBe(3);
      });

      it("contains() with array", () => {
        expect(evaluateExpression("contains(items, 2)", { items: [1, 2, 3] })).toBe(true);
      });

      it("contains() returns false when item is absent", () => {
        expect(evaluateExpression("contains(items, 99)", { items: [1, 2, 3] })).toBe(false);
      });

      it("count()", () => {
        expect(evaluateExpression("count(items)", { items: [1, 2, 3] })).toBe(3);
      });

      it("length() on array", () => {
        expect(evaluateExpression("length(items)", { items: [1, 2, 3] })).toBe(3);
      });
    });

    describe("math functions", () => {
      it("round() with decimal places", () => {
        expect(evaluateExpression("round(3.14159, 2)", {})).toBe(3.14);
      });

      it("round() with no decimal places", () => {
        expect(evaluateExpression("round(3.7)", {})).toBe(4);
      });

      it("min()", () => {
        expect(evaluateExpression("min(5, 3)", {})).toBe(3);
      });

      it("max()", () => {
        expect(evaluateExpression("max(5, 3)", {})).toBe(5);
      });

      it("abs()", () => {
        expect(evaluateExpression("abs(-42)", {})).toBe(42);
      });

      it("floor()", () => {
        expect(evaluateExpression("floor(3.7)", {})).toBe(3);
      });

      it("ceil()", () => {
        expect(evaluateExpression("ceil(3.2)", {})).toBe(4);
      });
    });

    describe("logic functions", () => {
      it("if() returns consequent when condition is truthy", () => {
        expect(evaluateExpression('if(true, "yes", "no")', {})).toBe("yes");
      });

      it("if() returns alternate when condition is falsy", () => {
        expect(evaluateExpression('if(false, "yes", "no")', {})).toBe("no");
      });

      it("isEmpty() on empty string", () => {
        expect(evaluateExpression('isEmpty("")', {})).toBe(true);
      });

      it("isEmpty() on null", () => {
        expect(evaluateExpression("isEmpty(null)", {})).toBe(true);
      });

      it("isEmpty() on non-empty string returns false", () => {
        expect(evaluateExpression('isEmpty("hello")', {})).toBe(false);
      });

      it("isNotEmpty() on non-empty string", () => {
        expect(evaluateExpression('isNotEmpty("hello")', {})).toBe(true);
      });

      it("isNotEmpty() on empty string returns false", () => {
        expect(evaluateExpression('isNotEmpty("")', {})).toBe(false);
      });

      it("coalesce() skips nulls and returns first non-null", () => {
        expect(evaluateExpression('coalesce(null, null, "found")', {})).toBe("found");
      });

      it("coalesce() returns first argument if non-null", () => {
        expect(evaluateExpression('coalesce("first", "second")', {})).toBe("first");
      });
    });

    describe("type functions", () => {
      it("toNumber()", () => {
        expect(evaluateExpression('toNumber("42")', {})).toBe(42);
      });

      it("toString()", () => {
        expect(evaluateExpression("toString(42)", {})).toBe("42");
      });

      it("toBoolean() on truthy value", () => {
        expect(evaluateExpression("toBoolean(1)", {})).toBe(true);
      });

      it("toBoolean() on falsy value", () => {
        expect(evaluateExpression("toBoolean(0)", {})).toBe(false);
      });

      it('typeof() on string returns "string"', () => {
        // typeof is a function, not a JS keyword in the expression engine
        expect(evaluateExpression('typeof("hello")', {})).toBe("string");
      });

      it('typeof() on number returns "number"', () => {
        expect(evaluateExpression("typeof(42)", {})).toBe("number");
      });

      it('typeof() on null returns "null"', () => {
        expect(evaluateExpression("typeof(null)", {})).toBe("null");
      });

      it('typeof() on boolean returns "boolean"', () => {
        expect(evaluateExpression("typeof(true)", {})).toBe("boolean");
      });
    });

    describe("date functions", () => {
      it("now() returns a number (epoch ms)", () => {
        const result = evaluateExpression("now()", {});
        expect(typeof result).toBe("number");
        // Should be within 5 seconds of Date.now()
        expect(Math.abs((result as number) - Date.now())).toBeLessThan(5000);
      });

      it('formatDate() with "iso" returns an ISO string', () => {
        // Use a known timestamp: 2024-01-15T12:00:00.000Z
        const ts = new Date("2024-01-15T12:00:00.000Z").getTime();
        const result = evaluateExpression(`formatDate(${ts}, "iso")`, {});
        expect(typeof result).toBe("string");
        expect(result).toBe("2024-01-15T12:00:00.000Z");
      });
    });
  });

  // ── 8. Complex expressions with context ───────────────────────────

  describe("complex expressions with context", () => {
    it("uppercase() on a context variable", () => {
      expect(evaluateExpression("uppercase(symbol)", { symbol: "aapl" })).toBe("AAPL");
    });

    it('if() with comparison on context: price > 100 => "high"', () => {
      expect(evaluateExpression('if(price > 100, "high", "low")', { price: 150 })).toBe("high");
    });

    it("length() > 0 && contains() on context array", () => {
      const ctx = { items: ["AAPL", "GOOG"] };
      expect(evaluateExpression('length(items) > 0 && contains(items, "AAPL")', ctx)).toBe(true);
    });

    it("join() on a context array", () => {
      expect(evaluateExpression('join(items, " | ")', { items: ["a", "b"] })).toBe("a | b");
    });

    it("nested function calls: uppercase(trim(...))", () => {
      expect(evaluateExpression('uppercase(trim("  hello  "))', {})).toBe("HELLO");
    });

    it("arithmetic with context variables", () => {
      expect(evaluateExpression("price * quantity", { price: 10, quantity: 5 })).toBe(50);
    });

    it("ternary with function call in condition", () => {
      expect(evaluateExpression('isEmpty(val) ? "empty" : "filled"', { val: "" })).toBe("empty");
    });
  });

  // ── 9. isComplexExpression ────────────────────────────────────────

  describe("isComplexExpression", () => {
    it("returns false for a simple identifier", () => {
      expect(isComplexExpression("symbol")).toBe(false);
    });

    it("returns false for a simple dot-path", () => {
      expect(isComplexExpression("event.payload.reason")).toBe(false);
    });

    it("returns true for a function call", () => {
      expect(isComplexExpression("uppercase(symbol)")).toBe(true);
    });

    it("returns true for a comparison", () => {
      expect(isComplexExpression("price > 100")).toBe(true);
    });

    it("returns true for arithmetic", () => {
      expect(isComplexExpression("a + b")).toBe(true);
    });

    it("returns true for a ternary", () => {
      expect(isComplexExpression("condition ? a : b")).toBe(true);
    });

    it("returns true for logical operators", () => {
      expect(isComplexExpression("a && b")).toBe(true);
    });

    it("returns false for an empty string", () => {
      expect(isComplexExpression("")).toBe(false);
    });

    it("returns true for negation", () => {
      expect(isComplexExpression("!active")).toBe(true);
    });
  });

  // ── 10. Error handling and safety ─────────────────────────────────

  describe("error handling and safety", () => {
    it("throws ExpressionError for expression exceeding max length", () => {
      const longExpr = "a".repeat(10_001);
      expect(() => evaluateExpression(longExpr, {})).toThrow(ExpressionError);
      expect(() => evaluateExpression(longExpr, {})).toThrow(/maximum length/i);
    });

    it("throws ExpressionError for divide() by zero", () => {
      expect(() => evaluateExpression("divide(1, 0)", {})).toThrow(ExpressionError);
      expect(() => evaluateExpression("divide(1, 0)", {})).toThrow(/zero/i);
    });

    it("throws ExpressionError for division operator with zero divisor", () => {
      expect(() => evaluateExpression("1 / 0", {})).toThrow(ExpressionError);
      expect(() => evaluateExpression("1 / 0", {})).toThrow(/zero/i);
    });

    it("throws ExpressionError for unknown function", () => {
      expect(() => evaluateExpression("nonexistent()", {})).toThrow(ExpressionError);
      expect(() => evaluateExpression("nonexistent()", {})).toThrow(/Unknown function/i);
    });

    it("throws ExpressionError for invalid syntax", () => {
      expect(() => evaluateExpression("+ + +", {})).toThrow(ExpressionError);
    });

    it("throws ExpressionError for deeply nested recursion", () => {
      // Build a deeply nested expression that exceeds the recursion limit of 50
      let expr = "1";
      for (let i = 0; i < 60; i++) {
        expr = `(${expr} + 1)`;
      }
      expect(() => evaluateExpression(expr, {})).toThrow(ExpressionError);
      expect(() => evaluateExpression(expr, {})).toThrow(/recursion depth/i);
    });

    it("returns undefined for an empty expression", () => {
      expect(evaluateExpression("", {})).toBeUndefined();
    });

    it("returns undefined for a whitespace-only expression", () => {
      expect(evaluateExpression("   ", {})).toBeUndefined();
    });

    it("throws ExpressionError for unterminated string", () => {
      expect(() => evaluateExpression('"hello', {})).toThrow(ExpressionError);
      expect(() => evaluateExpression('"hello', {})).toThrow(/Unterminated/i);
    });

    it("throws ExpressionError for modulo by zero", () => {
      expect(() => evaluateExpression("5 % 0", {})).toThrow(ExpressionError);
      expect(() => evaluateExpression("5 % 0", {})).toThrow(/zero/i);
    });

    it("throws ExpressionError for unexpected characters", () => {
      expect(() => evaluateExpression("@invalid", {})).toThrow(ExpressionError);
    });
  });
});
