/**
 * Unit tests for template injection hardening in ExecutionContext.
 *
 * Verifies: path depth limits, template re-injection prevention,
 * depth-limited resolution, and regression for normal usage.
 */

import { describe, it, expect } from "vitest";
import { ExecutionContext } from "../context.js";

// ── Regression: normal templates still work ────────────────────────

describe("ExecutionContext — normal template resolution", () => {
  it("resolves a simple top-level key", () => {
    const ctx = new ExecutionContext({ symbol: "AAPL" });
    expect(ctx.resolveTemplate("Buy {{symbol}}")).toBe("Buy AAPL");
  });

  it("resolves multiple keys in one template", () => {
    const ctx = new ExecutionContext({ symbol: "AAPL", qty: 100 });
    expect(ctx.resolveTemplate("{{symbol}} x{{qty}}")).toBe("AAPL x100");
  });

  it("resolves dot-path keys", () => {
    const ctx = new ExecutionContext({
      event: { payload: { reason: "stop loss" } },
    });
    expect(ctx.resolveTemplate("Reason: {{event.payload.reason}}")).toBe(
      "Reason: stop loss",
    );
  });

  it("resolves missing keys to empty string", () => {
    const ctx = new ExecutionContext({});
    expect(ctx.resolveTemplate("Hello {{name}}")).toBe("Hello ");
  });

  it("leaves non-template text unchanged", () => {
    const ctx = new ExecutionContext({});
    expect(ctx.resolveTemplate("no templates here")).toBe("no templates here");
  });
});

// ── Path depth limit ───────────────────────────────────────────────

describe("ExecutionContext — path depth limit", () => {
  const deepData = {
    a: { b: { c: { d: { e: "five" } } } },
  };

  it("resolves a path with exactly 5 segments", () => {
    const ctx = new ExecutionContext(deepData);
    expect(ctx.getPath("a.b.c.d.e")).toBe("five");
  });

  it("returns undefined for a path with 6 segments", () => {
    const data = { a: { b: { c: { d: { e: { f: "six" } } } } } };
    const ctx = new ExecutionContext(data);
    expect(ctx.getPath("a.b.c.d.e.f")).toBeUndefined();
  });

  it("returns undefined for deeply nested paths beyond the limit", () => {
    const ctx = new ExecutionContext({ a: { b: { c: { d: { e: { f: { g: "deep" } } } } } } });
    expect(ctx.getPath("a.b.c.d.e.f.g")).toBeUndefined();
  });

  it("resolves deep paths in templates as empty when over limit", () => {
    const data = { a: { b: { c: { d: { e: { f: "six" } } } } } };
    const ctx = new ExecutionContext(data);
    expect(ctx.resolveTemplate("val={{a.b.c.d.e.f}}")).toBe("val=");
  });
});

// ── Template re-injection prevention ───────────────────────────────

describe("ExecutionContext — injection prevention", () => {
  it("strips {{ and }} from resolved values", () => {
    const ctx = new ExecutionContext({ name: "{{secret}}" });
    const result = ctx.resolveTemplate("Hello {{name}}");
    expect(result).toBe("Hello { {secret} }");
    expect(result).not.toContain("{{");
    expect(result).not.toContain("}}");
  });

  it("resolved values containing template syntax do not resolve recursively", () => {
    const ctx = new ExecutionContext({
      input: "{{secret}}",
      secret: "LEAKED",
    });
    const result = ctx.resolveTemplate("Result: {{input}}");
    // The {{secret}} inside input must NOT resolve to "LEAKED"
    expect(result).not.toContain("LEAKED");
    expect(result).toBe("Result: { {secret} }");
  });

  it("prevents injection via nested dot-path values", () => {
    const ctx = new ExecutionContext({
      event: { payload: "{{secret}}" },
      secret: "LEAKED",
    });
    const result = ctx.resolveTemplate("Data: {{event.payload}}");
    expect(result).not.toContain("LEAKED");
    expect(result).toBe("Data: { {secret} }");
  });

  it("handles multiple injection attempts in a single template", () => {
    const ctx = new ExecutionContext({
      a: "{{b}}",
      b: "{{c}}",
      c: "final",
    });
    const result = ctx.resolveTemplate("{{a}} and {{b}}");
    expect(result).toBe("{ {b} } and { {c} }");
    expect(result).not.toContain("final");
  });
});

// ── Template depth limit ───────────────────────────────────────────

describe("ExecutionContext — template depth limit", () => {
  it("returns template as-is when depth >= MAX_TEMPLATE_DEPTH", () => {
    const ctx = new ExecutionContext({ key: "value" });
    // depth=3 (at the limit) should return template unresolved
    const result = ctx.resolveTemplate("{{key}}", 3);
    expect(result).toBe("{{key}}");
  });

  it("resolves normally at depth 0 (default)", () => {
    const ctx = new ExecutionContext({ key: "value" });
    expect(ctx.resolveTemplate("{{key}}")).toBe("value");
  });

  it("resolves at depth 1", () => {
    const ctx = new ExecutionContext({ key: "value" });
    expect(ctx.resolveTemplate("{{key}}", 1)).toBe("value");
  });

  it("resolves at depth 2", () => {
    const ctx = new ExecutionContext({ key: "value" });
    expect(ctx.resolveTemplate("{{key}}", 2)).toBe("value");
  });

  it("does not resolve at depth 4", () => {
    const ctx = new ExecutionContext({ key: "value" });
    expect(ctx.resolveTemplate("{{key}}", 4)).toBe("{{key}}");
  });
});
