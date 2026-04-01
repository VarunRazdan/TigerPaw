/**
 * Comprehensive unit tests for the Tigerpaw Workflow Engine.
 *
 * Covers: ExecutionContext, Conditions, Transforms, WorkflowEngine, History.
 */

import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluateCondition, supportedConditions } from "../conditions.js";
import { ExecutionContext } from "../context.js";
import { WorkflowEngine } from "../engine.js";
import { saveExecution, listExecutions, getExecution, clearHistory } from "../history.js";
import { executeTransform, supportedTransforms } from "../transforms.js";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecution,
  ActionDependencies,
  RetryConfig,
} from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function mockDeps(overrides?: Partial<ActionDependencies>): ActionDependencies {
  return {
    gatewayRpc: vi.fn().mockResolvedValue({ ok: true, payload: {} }),
    killSwitch: {
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue({ active: false }),
    },
    log: vi.fn(),
    ...overrides,
  };
}

function makeNode(
  partial: Partial<WorkflowNode> & { id: string; type: WorkflowNode["type"] },
): WorkflowNode {
  return {
    label: partial.label ?? `${partial.type}-${partial.id}`,
    subtype: partial.subtype ?? "",
    config: partial.config ?? {},
    position: partial.position ?? { x: 0, y: 0 },
    ...partial,
  };
}

function makeEdge(source: string, target: string, label?: string): WorkflowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    label,
  };
}

function makeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  overrides?: Partial<Workflow>,
): Workflow {
  return {
    id: overrides?.id ?? "wf-test",
    name: overrides?.name ?? "Test Workflow",
    description: overrides?.description ?? "A test workflow",
    enabled: overrides?.enabled ?? true,
    nodes,
    edges,
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    updatedAt: overrides?.updatedAt ?? new Date().toISOString(),
    runCount: overrides?.runCount ?? 0,
  };
}

// ── 1. ExecutionContext ──────────────────────────────────────────────

describe("ExecutionContext", () => {
  it("initializes with empty data when no triggerData is provided", () => {
    const ctx = new ExecutionContext();
    expect(ctx.size).toBe(0);
    expect(ctx.toJSON()).toEqual({});
  });

  it("initializes with a clone of triggerData", () => {
    const trigger = { symbol: "AAPL", price: 150 };
    const ctx = new ExecutionContext(trigger);
    expect(ctx.get("symbol")).toBe("AAPL");
    expect(ctx.get("price")).toBe(150);

    // Mutation of original should not affect context
    trigger.symbol = "GOOG";
    expect(ctx.get("symbol")).toBe("AAPL");
  });

  describe("get/set", () => {
    it("returns undefined for missing keys", () => {
      const ctx = new ExecutionContext();
      expect(ctx.get("missing")).toBeUndefined();
    });

    it("sets and retrieves values", () => {
      const ctx = new ExecutionContext();
      ctx.set("foo", "bar");
      expect(ctx.get("foo")).toBe("bar");
    });

    it("overwrites existing values", () => {
      const ctx = new ExecutionContext({ key: "old" });
      ctx.set("key", "new");
      expect(ctx.get("key")).toBe("new");
    });

    it("supports non-string values", () => {
      const ctx = new ExecutionContext();
      ctx.set("num", 42);
      ctx.set("arr", [1, 2, 3]);
      ctx.set("obj", { nested: true });
      ctx.set("bool", false);
      expect(ctx.get("num")).toBe(42);
      expect(ctx.get("arr")).toEqual([1, 2, 3]);
      expect(ctx.get("obj")).toEqual({ nested: true });
      expect(ctx.get("bool")).toBe(false);
    });
  });

  describe("merge", () => {
    it("merges an object into the context (shallow)", () => {
      const ctx = new ExecutionContext({ a: 1 });
      ctx.merge({ b: 2, c: 3 });
      expect(ctx.get("a")).toBe(1);
      expect(ctx.get("b")).toBe(2);
      expect(ctx.get("c")).toBe(3);
      expect(ctx.size).toBe(3);
    });

    it("overwrites existing keys on merge", () => {
      const ctx = new ExecutionContext({ a: 1 });
      ctx.merge({ a: 99 });
      expect(ctx.get("a")).toBe(99);
    });
  });

  describe("getPath", () => {
    it("accesses nested values via dot-path", () => {
      const ctx = new ExecutionContext({
        event: {
          payload: {
            symbol: "BTC",
            data: { price: 50000 },
          },
        },
      });
      expect(ctx.getPath("event.payload.symbol")).toBe("BTC");
      expect(ctx.getPath("event.payload.data.price")).toBe(50000);
    });

    it("returns undefined for missing intermediate segments", () => {
      const ctx = new ExecutionContext({ event: { payload: null } });
      expect(ctx.getPath("event.payload.symbol")).toBeUndefined();
      expect(ctx.getPath("nonexistent.path")).toBeUndefined();
    });

    it("returns top-level values for single-segment paths", () => {
      const ctx = new ExecutionContext({ name: "test" });
      expect(ctx.getPath("name")).toBe("test");
    });

    it("returns undefined when traversing a primitive", () => {
      const ctx = new ExecutionContext({ value: 42 });
      expect(ctx.getPath("value.nested")).toBeUndefined();
    });
  });

  describe("resolveTemplate", () => {
    it("resolves simple {{key}} placeholders", () => {
      const ctx = new ExecutionContext({ symbol: "AAPL", side: "buy" });
      expect(ctx.resolveTemplate("Order: {{symbol}} {{side}}")).toBe("Order: AAPL buy");
    });

    it("resolves nested {{path.to.value}} placeholders", () => {
      const ctx = new ExecutionContext({
        event: { payload: { reason: "stop-loss triggered" } },
      });
      expect(ctx.resolveTemplate("Reason: {{event.payload.reason}}")).toBe(
        "Reason: stop-loss triggered",
      );
    });

    it("replaces missing keys with empty string", () => {
      const ctx = new ExecutionContext({});
      expect(ctx.resolveTemplate("Hello {{name}}, welcome to {{place}}")).toBe(
        "Hello , welcome to ",
      );
    });

    it("handles templates with no placeholders", () => {
      const ctx = new ExecutionContext({ foo: "bar" });
      expect(ctx.resolveTemplate("No placeholders here")).toBe("No placeholders here");
    });

    it("handles whitespace inside braces", () => {
      const ctx = new ExecutionContext({ key: "value" });
      expect(ctx.resolveTemplate("{{ key }}")).toBe("value");
    });

    it("converts non-string values to string", () => {
      const ctx = new ExecutionContext({ count: 42, flag: true });
      expect(ctx.resolveTemplate("Count: {{count}}, Flag: {{flag}}")).toBe("Count: 42, Flag: true");
    });

    it("handles null values as empty string", () => {
      const ctx = new ExecutionContext({ val: null });
      expect(ctx.resolveTemplate("Value: {{val}}")).toBe("Value: ");
    });
  });

  describe("toJSON", () => {
    it("returns a plain object snapshot", () => {
      const ctx = new ExecutionContext({ a: 1, b: { c: 2 } });
      const json = ctx.toJSON();
      expect(json).toEqual({ a: 1, b: { c: 2 } });
    });

    it("returns a deep clone (mutations do not affect context)", () => {
      const ctx = new ExecutionContext({ nested: { val: 1 } });
      const json = ctx.toJSON();
      (json.nested as Record<string, unknown>).val = 999;
      expect(ctx.getPath("nested.val")).toBe(1);
    });
  });

  describe("size", () => {
    it("reports the number of top-level keys", () => {
      const ctx = new ExecutionContext({ a: 1, b: 2 });
      expect(ctx.size).toBe(2);
      ctx.set("c", 3);
      expect(ctx.size).toBe(3);
    });
  });
});

// ── 2. Conditions ───────────────────────────────────────────────────

describe("Conditions", () => {
  describe("supportedConditions", () => {
    it("returns all registered condition subtypes", () => {
      const supported = supportedConditions();
      expect(supported).toContain("contains_keyword");
      expect(supported).toContain("sender_matches");
      expect(supported).toContain("channel_is");
      expect(supported).toContain("time_of_day");
      expect(supported).toContain("expression");
    });
  });

  describe("contains_keyword", () => {
    it("matches case-insensitively by default", () => {
      const ctx = new ExecutionContext({ text: "Hello World" });
      expect(evaluateCondition("contains_keyword", { keyword: "hello" }, ctx)).toBe(true);
      expect(evaluateCondition("contains_keyword", { keyword: "WORLD" }, ctx)).toBe(true);
    });

    it("matches case-sensitively when configured", () => {
      const ctx = new ExecutionContext({ text: "Hello World" });
      expect(
        evaluateCondition("contains_keyword", { keyword: "Hello", caseSensitive: true }, ctx),
      ).toBe(true);
      expect(
        evaluateCondition("contains_keyword", { keyword: "hello", caseSensitive: true }, ctx),
      ).toBe(false);
    });

    it("falls back to message field when text is missing", () => {
      const ctx = new ExecutionContext({ message: "Alert: price dropped" });
      expect(evaluateCondition("contains_keyword", { keyword: "price" }, ctx)).toBe(true);
    });

    it("falls back to preview field", () => {
      const ctx = new ExecutionContext({ preview: "Preview text here" });
      expect(evaluateCondition("contains_keyword", { keyword: "Preview" }, ctx)).toBe(true);
    });

    it("returns false when keyword is empty", () => {
      const ctx = new ExecutionContext({ text: "anything" });
      expect(evaluateCondition("contains_keyword", { keyword: "" }, ctx)).toBe(false);
      expect(evaluateCondition("contains_keyword", {}, ctx)).toBe(false);
    });

    it("returns false when keyword is not found", () => {
      const ctx = new ExecutionContext({ text: "Hello World" });
      expect(evaluateCondition("contains_keyword", { keyword: "missing" }, ctx)).toBe(false);
    });
  });

  describe("sender_matches", () => {
    it("matches using regex pattern", () => {
      const ctx = new ExecutionContext({ sender: "admin@example.com" });
      expect(evaluateCondition("sender_matches", { pattern: "admin@.*" }, ctx)).toBe(true);
      expect(evaluateCondition("sender_matches", { pattern: "^admin" }, ctx)).toBe(true);
    });

    it("is case-insensitive for regex", () => {
      const ctx = new ExecutionContext({ sender: "Admin@Example.com" });
      expect(evaluateCondition("sender_matches", { pattern: "admin@example" }, ctx)).toBe(true);
    });

    it("falls back to author field when sender is missing", () => {
      const ctx = new ExecutionContext({ author: "bot-user" });
      expect(evaluateCondition("sender_matches", { pattern: "bot-.*" }, ctx)).toBe(true);
    });

    it("falls back to includes on invalid regex", () => {
      const ctx = new ExecutionContext({ sender: "test[user" });
      // "[user" is invalid regex, should fall back to includes
      expect(evaluateCondition("sender_matches", { pattern: "[user" }, ctx)).toBe(true);
    });

    it("returns false when pattern is empty", () => {
      const ctx = new ExecutionContext({ sender: "anyone" });
      expect(evaluateCondition("sender_matches", { pattern: "" }, ctx)).toBe(false);
      expect(evaluateCondition("sender_matches", {}, ctx)).toBe(false);
    });
  });

  describe("channel_is", () => {
    it("matches channel (case insensitive)", () => {
      const ctx = new ExecutionContext({ channel: "general" });
      expect(evaluateCondition("channel_is", { channel: "General" }, ctx)).toBe(true);
      expect(evaluateCondition("channel_is", { channel: "GENERAL" }, ctx)).toBe(true);
    });

    it("returns false for non-matching channel", () => {
      const ctx = new ExecutionContext({ channel: "general" });
      expect(evaluateCondition("channel_is", { channel: "random" }, ctx)).toBe(false);
    });

    it("returns false when target channel is empty", () => {
      const ctx = new ExecutionContext({ channel: "general" });
      expect(evaluateCondition("channel_is", { channel: "" }, ctx)).toBe(false);
      expect(evaluateCondition("channel_is", {}, ctx)).toBe(false);
    });
  });

  describe("time_of_day", () => {
    it("evaluates without errors (basic smoke test)", () => {
      // We cannot precisely control time without mocking Intl.DateTimeFormat,
      // but we can verify it does not throw and returns a boolean.
      const ctx = new ExecutionContext({});
      const result = evaluateCondition("time_of_day", { after: "00:00", before: "23:59" }, ctx);
      expect(typeof result).toBe("boolean");
      // 00:00 to 23:59 should always match
      expect(result).toBe(true);
    });

    it("returns false when time window is impossible", () => {
      const ctx = new ExecutionContext({});
      // A window where after > before in the same day — the formatted time
      // is unlikely to be between "23:59" and "00:00"
      const result = evaluateCondition("time_of_day", { after: "23:59", before: "00:00" }, ctx);
      expect(result).toBe(false);
    });
  });

  describe("expression", () => {
    it("evaluates == (equals)", () => {
      const ctx = new ExecutionContext({ status: "filled" });
      expect(
        evaluateCondition("expression", { left: "$status", operator: "==", right: "filled" }, ctx),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$status", operator: "==", right: "pending" }, ctx),
      ).toBe(false);
    });

    it("evaluates != (not equals)", () => {
      const ctx = new ExecutionContext({ status: "filled" });
      expect(
        evaluateCondition("expression", { left: "$status", operator: "!=", right: "pending" }, ctx),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$status", operator: "!=", right: "filled" }, ctx),
      ).toBe(false);
    });

    it("evaluates > with numeric values", () => {
      const ctx = new ExecutionContext({ price: 150 });
      expect(
        evaluateCondition("expression", { left: "$price", operator: ">", right: "100" }, ctx),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$price", operator: ">", right: "200" }, ctx),
      ).toBe(false);
    });

    it("evaluates < with numeric values", () => {
      const ctx = new ExecutionContext({ price: 50 });
      expect(
        evaluateCondition("expression", { left: "$price", operator: "<", right: "100" }, ctx),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$price", operator: "<", right: "25" }, ctx),
      ).toBe(false);
    });

    it("evaluates >= and <=", () => {
      const ctx = new ExecutionContext({ val: 10 });
      expect(
        evaluateCondition("expression", { left: "$val", operator: ">=", right: "10" }, ctx),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$val", operator: "<=", right: "10" }, ctx),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$val", operator: ">=", right: "11" }, ctx),
      ).toBe(false);
    });

    it("evaluates contains", () => {
      const ctx = new ExecutionContext({ msg: "Hello World" });
      expect(
        evaluateCondition(
          "expression",
          { left: "$msg", operator: "contains", right: "World" },
          ctx,
        ),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$msg", operator: "contains", right: "Mars" }, ctx),
      ).toBe(false);
    });

    it("evaluates starts_with", () => {
      const ctx = new ExecutionContext({ msg: "Hello World" });
      expect(
        evaluateCondition(
          "expression",
          { left: "$msg", operator: "starts_with", right: "Hello" },
          ctx,
        ),
      ).toBe(true);
      expect(
        evaluateCondition(
          "expression",
          { left: "$msg", operator: "starts_with", right: "World" },
          ctx,
        ),
      ).toBe(false);
    });

    it("evaluates ends_with", () => {
      const ctx = new ExecutionContext({ msg: "Hello World" });
      expect(
        evaluateCondition(
          "expression",
          { left: "$msg", operator: "ends_with", right: "World" },
          ctx,
        ),
      ).toBe(true);
    });

    it("evaluates matches (regex)", () => {
      const ctx = new ExecutionContext({ code: "ERR-404" });
      expect(
        evaluateCondition(
          "expression",
          { left: "$code", operator: "matches", right: "ERR-\\d+" },
          ctx,
        ),
      ).toBe(true);
      expect(
        evaluateCondition("expression", { left: "$code", operator: "matches", right: "^OK" }, ctx),
      ).toBe(false);
    });

    it("returns false for invalid regex in matches", () => {
      const ctx = new ExecutionContext({ code: "test" });
      expect(
        evaluateCondition(
          "expression",
          { left: "$code", operator: "matches", right: "[invalid" },
          ctx,
        ),
      ).toBe(false);
    });

    it("uses literal values when not prefixed with $", () => {
      const ctx = new ExecutionContext({});
      expect(
        evaluateCondition("expression", { left: "hello", operator: "==", right: "hello" }, ctx),
      ).toBe(true);
    });

    it("resolves both sides from context when both prefixed with $", () => {
      const ctx = new ExecutionContext({ a: "same", b: "same" });
      expect(
        evaluateCondition("expression", { left: "$a", operator: "==", right: "$b" }, ctx),
      ).toBe(true);
    });

    it("returns false for numeric operators with non-numeric values", () => {
      const ctx = new ExecutionContext({ val: "abc" });
      expect(
        evaluateCondition("expression", { left: "$val", operator: ">", right: "5" }, ctx),
      ).toBe(false);
    });

    it("returns false for unknown operator", () => {
      const ctx = new ExecutionContext({});
      expect(evaluateCondition("expression", { left: "a", operator: "xor", right: "b" }, ctx)).toBe(
        false,
      );
    });

    it("supports 'equals' alias for ==", () => {
      const ctx = new ExecutionContext({});
      expect(
        evaluateCondition("expression", { left: "x", operator: "equals", right: "x" }, ctx),
      ).toBe(true);
    });

    it("supports 'not_equals' alias for !=", () => {
      const ctx = new ExecutionContext({});
      expect(
        evaluateCondition("expression", { left: "x", operator: "not_equals", right: "y" }, ctx),
      ).toBe(true);
    });
  });

  describe("unknown subtype", () => {
    it("returns false for unrecognized condition subtypes", () => {
      const ctx = new ExecutionContext({ text: "hello" });
      expect(evaluateCondition("nonexistent_condition", {}, ctx)).toBe(false);
    });
  });
});

// ── 3. Transforms ───────────────────────────────────────────────────

describe("Transforms", () => {
  describe("supportedTransforms", () => {
    it("returns all registered transform subtypes", () => {
      const supported = supportedTransforms();
      expect(supported).toContain("extract_data");
      expect(supported).toContain("format_text");
      expect(supported).toContain("parse_json");
    });
  });

  describe("extract_data", () => {
    it("extracts a nested value by dot path", () => {
      const ctx = new ExecutionContext({
        event: { payload: { symbol: "ETH", price: 3500 } },
      });
      const result = executeTransform("extract_data", { path: "event.payload.symbol" }, ctx);
      expect(result[0].json).toEqual({ extracted: "ETH" });
    });

    it("uses a custom outputKey", () => {
      const ctx = new ExecutionContext({ data: { value: 42 } });
      const result = executeTransform(
        "extract_data",
        { path: "data.value", outputKey: "myValue" },
        ctx,
      );
      expect(result[0].json).toEqual({ myValue: 42 });
    });

    it("returns undefined for a missing path", () => {
      const ctx = new ExecutionContext({ data: {} });
      const result = executeTransform("extract_data", { path: "data.missing.deep" }, ctx);
      expect(result[0].json).toEqual({ extracted: undefined });
    });

    it("throws when path is empty", () => {
      const ctx = new ExecutionContext({});
      expect(() => executeTransform("extract_data", { path: "" }, ctx)).toThrow(
        "extract_data: path is required",
      );
    });

    it("throws when path is not provided", () => {
      const ctx = new ExecutionContext({});
      expect(() => executeTransform("extract_data", {}, ctx)).toThrow(
        "extract_data: path is required",
      );
    });
  });

  describe("format_text", () => {
    it("resolves a template using context values", () => {
      const ctx = new ExecutionContext({ symbol: "AAPL", qty: 10 });
      const result = executeTransform(
        "format_text",
        { template: "Buy {{qty}} shares of {{symbol}}" },
        ctx,
      );
      expect(result[0].json).toEqual({ formatted: "Buy 10 shares of AAPL" });
    });

    it("uses a custom outputKey", () => {
      const ctx = new ExecutionContext({ name: "Alice" });
      const result = executeTransform(
        "format_text",
        { template: "Hello {{name}}", outputKey: "greeting" },
        ctx,
      );
      expect(result[0].json).toEqual({ greeting: "Hello Alice" });
    });

    it("replaces missing keys with empty string", () => {
      const ctx = new ExecutionContext({});
      const result = executeTransform("format_text", { template: "Value: {{missing}}" }, ctx);
      expect(result[0].json).toEqual({ formatted: "Value: " });
    });

    it("throws when template is empty", () => {
      const ctx = new ExecutionContext({});
      expect(() => executeTransform("format_text", { template: "" }, ctx)).toThrow(
        "format_text: template is required",
      );
    });

    it("throws when template is not provided", () => {
      const ctx = new ExecutionContext({});
      expect(() => executeTransform("format_text", {}, ctx)).toThrow(
        "format_text: template is required",
      );
    });
  });

  describe("parse_json", () => {
    it("parses a JSON string from context", () => {
      const ctx = new ExecutionContext({ webhookResponse: '{"status":"ok","code":200}' });
      const result = executeTransform("parse_json", {}, ctx);
      expect(result[0].json).toEqual({ parsed: { status: "ok", code: 200 } });
    });

    it("returns already-parsed objects as-is", () => {
      const ctx = new ExecutionContext({ webhookResponse: { already: "parsed" } });
      const result = executeTransform("parse_json", {}, ctx);
      expect(result[0].json).toEqual({ parsed: { already: "parsed" } });
    });

    it("uses custom inputKey and outputKey", () => {
      const ctx = new ExecutionContext({ rawData: '{"x":1}' });
      const result = executeTransform(
        "parse_json",
        { inputKey: "rawData", outputKey: "jsonData" },
        ctx,
      );
      expect(result[0].json).toEqual({ jsonData: { x: 1 } });
    });

    it("throws when inputKey value is missing from context", () => {
      const ctx = new ExecutionContext({});
      expect(() => executeTransform("parse_json", {}, ctx)).toThrow(
        'parse_json: no value at key "webhookResponse"',
      );
    });

    it("throws when inputKey value is missing (custom key)", () => {
      const ctx = new ExecutionContext({});
      expect(() => executeTransform("parse_json", { inputKey: "myKey" }, ctx)).toThrow(
        'parse_json: no value at key "myKey"',
      );
    });

    it("throws on invalid JSON string", () => {
      const ctx = new ExecutionContext({ webhookResponse: "not valid json{{{" });
      expect(() => executeTransform("parse_json", {}, ctx)).toThrow();
    });
  });

  describe("unknown subtype", () => {
    it("throws for unrecognized transform subtypes", () => {
      const ctx = new ExecutionContext({});
      expect(() => executeTransform("nonexistent_transform", {}, ctx)).toThrow(
        "Unknown transform subtype: nonexistent_transform",
      );
    });
  });
});

// ── 4. WorkflowEngine ───────────────────────────────────────────────

describe("WorkflowEngine", () => {
  let deps: ActionDependencies;

  beforeEach(() => {
    deps = mockDeps();
  });

  describe("simple trigger -> action", () => {
    it("executes a trigger followed by a send_message action", async () => {
      const trigger = makeNode({
        id: "t1",
        type: "trigger",
        subtype: "manual",
        label: "Manual Trigger",
      });
      const action = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Send Alert",
        config: { message: "Alert: {{symbol}} hit {{price}}", to: "user@test.com" },
      });

      const workflow = makeWorkflow([trigger, action], [makeEdge("t1", "a1")]);
      const engine = new WorkflowEngine(deps);

      const result = await engine.execute(workflow, "t1", { symbol: "BTC", price: 50000 });

      expect(result.status).toBe("completed");
      expect(result.workflowId).toBe("wf-test");
      expect(result.triggeredBy).toBe("t1");
      expect(result.nodeResults).toHaveLength(2); // trigger + action
      expect(result.nodeResults[0].nodeType).toBe("trigger");
      expect(result.nodeResults[0].status).toBe("success");
      expect(result.nodeResults[1].nodeType).toBe("action");
      expect(result.nodeResults[1].status).toBe("success");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.completedAt).toBeDefined();

      // gatewayRpc should have been called for send_message
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "send",
        expect.objectContaining({
          message: "Alert: BTC hit 50000",
        }),
      );
    });
  });

  describe("trigger -> condition (match) -> action", () => {
    it("executes the action when condition matches", async () => {
      const trigger = makeNode({
        id: "t1",
        type: "trigger",
        subtype: "message.received",
        label: "Message Trigger",
      });
      const condition = makeNode({
        id: "c1",
        type: "condition",
        subtype: "contains_keyword",
        label: "Check Keyword",
        config: { keyword: "urgent" },
      });
      const action = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Forward Alert",
        config: { message: "Forwarded: {{text}}", to: "admin" },
      });

      const workflow = makeWorkflow(
        [trigger, condition, action],
        [makeEdge("t1", "c1"), makeEdge("c1", "a1", "match")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1", { text: "This is urgent!" });

      expect(result.status).toBe("completed");
      expect(result.nodeResults).toHaveLength(3); // trigger + condition + action
      expect(result.nodeResults[1].status).toBe("success"); // condition matched
      expect(result.nodeResults[1].output).toEqual({ conditionResult: true });
      expect(result.nodeResults[2].status).toBe("success"); // action executed
    });
  });

  describe("trigger -> condition (no match) -> action (should skip)", () => {
    it("skips the action when condition does not match", async () => {
      const trigger = makeNode({
        id: "t1",
        type: "trigger",
        subtype: "message.received",
        label: "Message Trigger",
      });
      const condition = makeNode({
        id: "c1",
        type: "condition",
        subtype: "contains_keyword",
        label: "Check Keyword",
        config: { keyword: "urgent" },
      });
      const action = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Forward Alert",
        config: { message: "Forwarded: {{text}}", to: "admin" },
      });

      const workflow = makeWorkflow(
        [trigger, condition, action],
        [makeEdge("t1", "c1"), makeEdge("c1", "a1", "match")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1", { text: "Nothing special here" });

      expect(result.status).toBe("completed");
      expect(result.nodeResults).toHaveLength(2); // trigger + condition
      expect(result.nodeResults[1].status).toBe("success"); // condition evaluates (routes via edge label)
      expect(result.nodeResults[1].output).toEqual({ conditionResult: false });
      // Action should NOT be in the results — only "match" edge exists, condition returned false
      // so the engine follows "no-match" label which has no matching edge
      expect(deps.gatewayRpc).not.toHaveBeenCalled();
    });
  });

  describe("trigger -> action -> action (chain)", () => {
    it("executes actions in sequence, passing data through context", async () => {
      (deps.gatewayRpc as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, payload: { messageId: "msg-1" } })
        .mockResolvedValueOnce({ ok: true, payload: { response: "LLM says hello" } });

      const trigger = makeNode({
        id: "t1",
        type: "trigger",
        subtype: "manual",
        label: "Manual",
      });
      const action1 = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Send First",
        config: { message: "Step 1: {{symbol}}", to: "user" },
      });
      const action2 = makeNode({
        id: "a2",
        type: "action",
        subtype: "run_llm_task",
        label: "Run LLM",
        config: { prompt: "Analyze {{symbol}}" },
      });

      const workflow = makeWorkflow(
        [trigger, action1, action2],
        [makeEdge("t1", "a1"), makeEdge("a1", "a2")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1", { symbol: "ETH" });

      expect(result.status).toBe("completed");
      expect(result.nodeResults).toHaveLength(3);
      expect(result.nodeResults[1].nodeId).toBe("a1");
      expect(result.nodeResults[1].status).toBe("success");
      expect(result.nodeResults[2].nodeId).toBe("a2");
      expect(result.nodeResults[2].status).toBe("success");
      expect(deps.gatewayRpc).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("stops execution and marks as failed when action errors", async () => {
      (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Network timeout",
      });

      const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
      const action1 = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Broken Action",
        config: { message: "test", to: "user" },
      });
      const action2 = makeNode({
        id: "a2",
        type: "action",
        subtype: "send_message",
        label: "Never Reached",
        config: { message: "this should not run", to: "user" },
      });

      const workflow = makeWorkflow(
        [trigger, action1, action2],
        [makeEdge("t1", "a1"), makeEdge("a1", "a2")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1");

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Broken Action");
      // action2 should not appear in results
      const action2Result = result.nodeResults.find((r) => r.nodeId === "a2");
      expect(action2Result).toBeUndefined();
    });

    it("fails when trigger node ID does not exist", async () => {
      const workflow = makeWorkflow([], []);
      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "nonexistent");

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Trigger node");
      expect(result.error).toContain("not found");
    });
  });

  describe("unknown node type handling", () => {
    it("handles a node with an unrecognized type gracefully", async () => {
      const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
      const unknownNode = makeNode({
        id: "u1",
        type: "mystery" as WorkflowNode["type"],
        subtype: "unknown",
        label: "Mystery Node",
      });

      const workflow = makeWorkflow([trigger, unknownNode], [makeEdge("t1", "u1")]);

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1");

      // The engine should record the error from the unknown node type
      expect(result.status).toBe("failed");
      expect(result.error).toContain("Unknown node type");
    });
  });

  describe("cycle detection", () => {
    it("prevents infinite loops by tracking visited nodes", async () => {
      (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        payload: {},
      });

      const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
      const action1 = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Action A",
        config: { message: "step A", to: "user" },
      });
      const action2 = makeNode({
        id: "a2",
        type: "action",
        subtype: "send_message",
        label: "Action B",
        config: { message: "step B", to: "user" },
      });

      // Create a cycle: t1 -> a1 -> a2 -> a1
      const workflow = makeWorkflow(
        [trigger, action1, action2],
        [makeEdge("t1", "a1"), makeEdge("a1", "a2"), makeEdge("a2", "a1")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1");

      // Should complete successfully despite cycle, because visited set prevents re-visiting a1
      expect(result.status).toBe("completed");
      // Each node should only appear once (trigger + a1 + a2 = 3)
      expect(result.nodeResults).toHaveLength(3);
      const nodeIds = result.nodeResults.map((r) => r.nodeId);
      expect(new Set(nodeIds).size).toBe(nodeIds.length); // no duplicates
    });

    it("prevents self-loops", async () => {
      (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, payload: {} });

      const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
      const action = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Self Loop",
        config: { message: "loop", to: "user" },
      });

      // Self-loop: a1 -> a1
      const workflow = makeWorkflow(
        [trigger, action],
        [makeEdge("t1", "a1"), makeEdge("a1", "a1")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1");

      expect(result.status).toBe("completed");
      expect(result.nodeResults).toHaveLength(2); // trigger + action (only once)
    });
  });

  describe("transform nodes in workflow", () => {
    it("executes transform and merges output into context", async () => {
      (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, payload: {} });

      const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
      const transform = makeNode({
        id: "x1",
        type: "transform",
        subtype: "format_text",
        label: "Format",
        config: { template: "Alert for {{symbol}} at ${{price}}", outputKey: "alertText" },
      });
      const action = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Send",
        config: { message: "{{alertText}}", to: "admin" },
      });

      const workflow = makeWorkflow(
        [trigger, transform, action],
        [makeEdge("t1", "x1"), makeEdge("x1", "a1")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1", { symbol: "BTC", price: 65000 });

      expect(result.status).toBe("completed");
      expect(result.nodeResults).toHaveLength(3);
      expect(result.nodeResults[1].nodeType).toBe("transform");
      expect(result.nodeResults[1].output).toEqual({ alertText: "Alert for BTC at $65000" });

      // The action should use the formatted text from context
      expect(deps.gatewayRpc).toHaveBeenCalledWith(
        "send",
        expect.objectContaining({
          message: "Alert for BTC at $65000",
        }),
      );
    });
  });

  describe("additional trigger nodes in graph", () => {
    it("skips additional trigger nodes encountered during traversal", async () => {
      (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, payload: {} });

      const trigger1 = makeNode({
        id: "t1",
        type: "trigger",
        subtype: "manual",
        label: "Primary Trigger",
      });
      const trigger2 = makeNode({
        id: "t2",
        type: "trigger",
        subtype: "cron",
        label: "Secondary Trigger",
      });
      const action = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Action",
        config: { message: "test", to: "user" },
      });

      const workflow = makeWorkflow(
        [trigger1, trigger2, action],
        [makeEdge("t1", "t2"), makeEdge("t2", "a1")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1");

      // t2 should be marked as skipped since additional triggers are no-ops
      // Because it's skipped, traversal stops and a1 is not reached
      expect(result.status).toBe("completed");
      const t2Result = result.nodeResults.find((r) => r.nodeId === "t2");
      expect(t2Result).toBeDefined();
      expect(t2Result!.status).toBe("skipped");
    });
  });

  describe("execution metadata", () => {
    it("populates execution ID, timing, and triggerData", async () => {
      const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "T" });
      const workflow = makeWorkflow([trigger], []);

      const engine = new WorkflowEngine(deps);
      const triggerData = { source: "test" };
      const result = await engine.execute(workflow, "t1", triggerData);

      expect(result.id).toMatch(/^run-/);
      expect(result.workflowId).toBe("wf-test");
      expect(result.workflowName).toBe("Test Workflow");
      expect(result.triggeredBy).toBe("t1");
      expect(result.triggerData).toEqual(triggerData);
      expect(result.startedAt).toBeGreaterThan(0);
      expect(result.completedAt).toBeGreaterThan(0);
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("branching graph", () => {
    it("follows multiple outgoing edges from a single node", async () => {
      (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, payload: {} });

      const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "T" });
      const action1 = makeNode({
        id: "a1",
        type: "action",
        subtype: "send_message",
        label: "Branch A",
        config: { message: "branch A", to: "user1" },
      });
      const action2 = makeNode({
        id: "a2",
        type: "action",
        subtype: "send_message",
        label: "Branch B",
        config: { message: "branch B", to: "user2" },
      });

      // Trigger fans out to two actions
      const workflow = makeWorkflow(
        [trigger, action1, action2],
        [makeEdge("t1", "a1"), makeEdge("t1", "a2")],
      );

      const engine = new WorkflowEngine(deps);
      const result = await engine.execute(workflow, "t1");

      expect(result.status).toBe("completed");
      expect(result.nodeResults).toHaveLength(3); // trigger + 2 actions
      expect(deps.gatewayRpc).toHaveBeenCalledTimes(2);
    });
  });
});

// ── 5. History ──────────────────────────────────────────────────────

describe("History", () => {
  const testWorkflowId = `test-wf-history-${Date.now()}`;
  const runsDir = join(homedir(), ".tigerpaw", "workflow-runs", testWorkflowId);

  function makeExecution(overrides?: Partial<WorkflowExecution>): WorkflowExecution {
    const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      workflowId: testWorkflowId,
      workflowName: "Test Workflow",
      triggeredBy: "t1",
      status: "completed",
      startedAt: Date.now(),
      completedAt: Date.now() + 100,
      durationMs: 100,
      nodeResults: [],
      ...overrides,
    };
  }

  afterEach(() => {
    // Clean up test files
    clearHistory(testWorkflowId);
    try {
      if (existsSync(runsDir)) {
        rmSync(runsDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("saveExecution / getExecution", () => {
    it("saves and retrieves an execution", () => {
      const exec = makeExecution();
      saveExecution(exec);

      const retrieved = getExecution(testWorkflowId, exec.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(exec.id);
      expect(retrieved!.workflowId).toBe(testWorkflowId);
      expect(retrieved!.status).toBe("completed");
    });

    it("returns null for nonexistent execution", () => {
      const result = getExecution(testWorkflowId, "nonexistent-id");
      expect(result).toBeNull();
    });

    it("returns null for nonexistent workflow", () => {
      const result = getExecution("nonexistent-wf", "nonexistent-id");
      expect(result).toBeNull();
    });
  });

  describe("listExecutions", () => {
    it("lists executions newest first", async () => {
      const exec1 = makeExecution({ id: "run-oldest" });
      saveExecution(exec1);

      // Small delay to ensure different mtime
      await new Promise((r) => setTimeout(r, 50));

      const exec2 = makeExecution({ id: "run-newest" });
      saveExecution(exec2);

      const { executions, total } = listExecutions(testWorkflowId);
      expect(total).toBe(2);
      expect(executions).toHaveLength(2);
      // Newest should be first (sorted by mtime desc)
      expect(executions[0].id).toBe("run-newest");
      expect(executions[1].id).toBe("run-oldest");
    });

    it("returns empty for nonexistent workflow", () => {
      const { executions, total } = listExecutions("nonexistent-wf-id");
      expect(executions).toEqual([]);
      expect(total).toBe(0);
    });
  });

  describe("pagination", () => {
    it("respects limit and offset", async () => {
      // Save 5 executions with slight delays so mtime differs
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const exec = makeExecution({ id: `run-page-${i}` });
        saveExecution(exec);
        ids.push(exec.id);
        if (i < 4) {
          await new Promise((r) => setTimeout(r, 30));
        }
      }

      // Get first 2
      const page1 = listExecutions(testWorkflowId, { limit: 2, offset: 0 });
      expect(page1.total).toBe(5);
      expect(page1.executions).toHaveLength(2);

      // Get next 2
      const page2 = listExecutions(testWorkflowId, { limit: 2, offset: 2 });
      expect(page2.total).toBe(5);
      expect(page2.executions).toHaveLength(2);

      // Get last 1
      const page3 = listExecutions(testWorkflowId, { limit: 2, offset: 4 });
      expect(page3.total).toBe(5);
      expect(page3.executions).toHaveLength(1);

      // Offset beyond total
      const page4 = listExecutions(testWorkflowId, { limit: 2, offset: 10 });
      expect(page4.total).toBe(5);
      expect(page4.executions).toHaveLength(0);
    });
  });

  describe("clearHistory", () => {
    it("removes all execution files for a workflow", () => {
      saveExecution(makeExecution({ id: "run-clear-1" }));
      saveExecution(makeExecution({ id: "run-clear-2" }));
      saveExecution(makeExecution({ id: "run-clear-3" }));

      // Verify they exist
      const before = listExecutions(testWorkflowId);
      expect(before.total).toBe(3);

      clearHistory(testWorkflowId);

      // After clearing, the directory should be empty (files deleted)
      const after = listExecutions(testWorkflowId);
      expect(after.total).toBe(0);
    });

    it("does not throw for nonexistent workflow", () => {
      expect(() => clearHistory("nonexistent-wf-clear")).not.toThrow();
    });
  });
});

// ── 6. Error Handler Routing ─────────────────────────────────────────

describe("Error Handler Routing", () => {
  let deps: ActionDependencies;

  beforeEach(() => {
    deps = mockDeps();
  });

  it("routes to errorHandlerId node on action failure", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "Service unavailable",
    });

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Flaky Action",
      config: { message: "test", to: "user" },
      errorHandlerId: "eh1",
    });
    const errorHandler = makeNode({
      id: "eh1",
      type: "error_handler",
      subtype: "log_error",
      label: "Log Error",
      config: { action: "log" },
    });

    const workflow = makeWorkflow([trigger, action, errorHandler], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    // Should have: trigger, failed action, error handler
    const ehResult = result.nodeResults.find((r) => r.nodeId === "eh1");
    expect(ehResult).toBeDefined();
    expect(ehResult!.status).toBe("success");
    expect(ehResult!.output).toMatchObject({ errorHandled: true, errorAction: "log" });
    // Error handler should receive error info
    expect(ehResult!.output).toHaveProperty("originalError");
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("Log Error"));
  });

  it("routes via 'error' labeled edges on failure", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, error: "timeout" }) // a1 fails
      .mockResolvedValueOnce({ ok: true, payload: {} }); // fallback succeeds

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Primary Action",
      config: { message: "main", to: "user" },
    });
    const fallback = makeNode({
      id: "fb1",
      type: "action",
      subtype: "send_message",
      label: "Fallback Action",
      config: { message: "fallback triggered", to: "admin" },
    });

    const workflow = makeWorkflow(
      [trigger, action, fallback],
      [makeEdge("t1", "a1"), makeEdge("a1", "fb1", "error")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    const fbResult = result.nodeResults.find((r) => r.nodeId === "fb1");
    expect(fbResult).toBeDefined();
    expect(fbResult!.status).toBe("success");
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(2);
  });

  it("fails fast when no error handler is configured", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "boom",
    });

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "No Handler",
      config: { message: "test", to: "user" },
    });

    const workflow = makeWorkflow([trigger, action], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("No Handler");
  });

  it("error handler with notify action sends a message", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, error: "API down" }) // action fails
      .mockResolvedValueOnce({ ok: true, payload: {} }); // notify message succeeds

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Broken",
      config: { message: "test", to: "user" },
      errorHandlerId: "eh1",
    });
    const errorHandler = makeNode({
      id: "eh1",
      type: "error_handler",
      subtype: "notify_error",
      label: "Notify Admin",
      config: {
        action: "notify",
        to: "admin",
        template: "Error in {{error.nodeLabel}}: {{error.message}}",
      },
    });

    const workflow = makeWorkflow([trigger, action, errorHandler], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    // Second RPC call should be the notify message
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(2);
  });
});

// ── 7. Retry / Backoff ──────────────────────────────────────────────

describe("Retry / Backoff", () => {
  let deps: ActionDependencies;

  beforeEach(() => {
    deps = mockDeps();
  });

  it("retries a failing action up to maxRetries then fails", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "temporary failure",
    });

    const retryConfig: RetryConfig = {
      maxRetries: 2,
      delayMs: 1,
      maxDelayMs: 10,
      backoff: "none",
    };

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Retryable Action",
      config: { message: "retry me", to: "user" },
      retryConfig,
    });

    const workflow = makeWorkflow([trigger, action], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("failed");
    // Should have called RPC 3 times: 1 initial + 2 retries
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(3);
    // Log should mention retrying
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("Retrying"));
    // The node result should record retryCount
    const a1Result = result.nodeResults.find((r) => r.nodeId === "a1");
    expect(a1Result).toBeDefined();
    expect(a1Result!.retryCount).toBe(2);
  });

  it("succeeds on a later retry attempt", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, error: "fail 1" })
      .mockResolvedValueOnce({ ok: false, error: "fail 2" })
      .mockResolvedValueOnce({ ok: true, payload: { sent: true } });

    const retryConfig: RetryConfig = {
      maxRetries: 3,
      delayMs: 1,
      maxDelayMs: 10,
      backoff: "none",
    };

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Eventually Works",
      config: { message: "hello", to: "user" },
      retryConfig,
    });

    const workflow = makeWorkflow([trigger, action], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(3);
    const a1Result = result.nodeResults.find((r) => r.nodeId === "a1");
    expect(a1Result!.status).toBe("success");
    expect(a1Result!.retryCount).toBe(2); // Succeeded on attempt index 2
  });

  it("does not retry when retryConfig is absent", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "one-shot failure",
    });

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "No Retry",
      config: { message: "test", to: "user" },
    });

    const workflow = makeWorkflow([trigger, action], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("failed");
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(1);
  });

  it("uses linear backoff delays", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "fail",
    });

    const retryConfig: RetryConfig = {
      maxRetries: 2,
      delayMs: 5,
      maxDelayMs: 100,
      backoff: "linear",
    };

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Linear Retry",
      config: { message: "test", to: "user" },
      retryConfig,
    });

    const workflow = makeWorkflow([trigger, action], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const start = Date.now();
    await engine.execute(workflow, "t1");
    const elapsed = Date.now() - start;

    // Linear: delay*(1) + delay*(2) = 5 + 10 = 15ms minimum
    // Allow some margin for overhead
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(3);
  });

  it("retry combined with error handler: retries first, then routes to handler", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "persistent failure",
    });

    const retryConfig: RetryConfig = {
      maxRetries: 1,
      delayMs: 1,
      maxDelayMs: 10,
      backoff: "none",
    };

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Retry Then Handle",
      config: { message: "test", to: "user" },
      retryConfig,
      errorHandlerId: "eh1",
    });
    const errorHandler = makeNode({
      id: "eh1",
      type: "error_handler",
      subtype: "log_error",
      label: "Catch All",
      config: { action: "log" },
    });

    const workflow = makeWorkflow([trigger, action, errorHandler], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    // Retries exhausted → error handler catches it → workflow completes
    expect(result.status).toBe("completed");
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    const ehResult = result.nodeResults.find((r) => r.nodeId === "eh1");
    expect(ehResult).toBeDefined();
    expect(ehResult!.status).toBe("success");
  });
});

// ── 8. Parallel Branches ────────────────────────────────────────────

describe("Parallel Branches", () => {
  let deps: ActionDependencies;

  beforeEach(() => {
    deps = mockDeps();
  });

  it("executes multiple branches in parallel", async () => {
    const callOrder: string[] = [];
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockImplementation(
      async (_method: string, params: Record<string, unknown>) => {
        callOrder.push(params.to as string);
        return { ok: true, payload: {} };
      },
    );

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const branchA = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Branch A",
      config: { message: "A", to: "userA" },
    });
    const branchB = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Branch B",
      config: { message: "B", to: "userB" },
    });
    const branchC = makeNode({
      id: "a3",
      type: "action",
      subtype: "send_message",
      label: "Branch C",
      config: { message: "C", to: "userC" },
    });

    const workflow = makeWorkflow(
      [trigger, branchA, branchB, branchC],
      [makeEdge("t1", "a1"), makeEdge("t1", "a2"), makeEdge("t1", "a3")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    expect(result.nodeResults).toHaveLength(4); // trigger + 3 branches
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(3);
    // All three branches should have run
    expect(callOrder).toHaveLength(3);
    expect(callOrder).toContain("userA");
    expect(callOrder).toContain("userB");
    expect(callOrder).toContain("userC");
  });

  it("one failing branch does not prevent other branches from completing", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockImplementation(
      async (_method: string, params: Record<string, unknown>) => {
        if (params.to === "failUser") {
          return { ok: false, error: "branch failed" };
        }
        return { ok: true, payload: {} };
      },
    );

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const goodBranch = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Good Branch",
      config: { message: "ok", to: "goodUser" },
    });
    const failBranch = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Fail Branch",
      config: { message: "fail", to: "failUser" },
    });

    const workflow = makeWorkflow(
      [trigger, goodBranch, failBranch],
      [makeEdge("t1", "a1"), makeEdge("t1", "a2")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    // The failing branch has no error handler, so it propagates
    expect(result.status).toBe("failed");
    // Both branches should have been attempted
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(2);
  });

  it("failing branch with error handler allows workflow to complete", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockImplementation(
      async (_method: string, params: Record<string, unknown>) => {
        if (params.to === "failUser") {
          return { ok: false, error: "branch error" };
        }
        return { ok: true, payload: {} };
      },
    );

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const goodBranch = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Good Branch",
      config: { message: "ok", to: "goodUser" },
    });
    const failBranch = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Handled Fail",
      config: { message: "fail", to: "failUser" },
      errorHandlerId: "eh1",
    });
    const errorHandler = makeNode({
      id: "eh1",
      type: "error_handler",
      subtype: "log_error",
      label: "Branch Error Handler",
      config: { action: "log" },
    });

    const workflow = makeWorkflow(
      [trigger, goodBranch, failBranch, errorHandler],
      [makeEdge("t1", "a1"), makeEdge("t1", "a2")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    const ehResult = result.nodeResults.find((r) => r.nodeId === "eh1");
    expect(ehResult).toBeDefined();
    expect(ehResult!.status).toBe("success");
  });

  it("parallel branches each continue to their own downstream nodes", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, payload: {} });

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const branchA = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Branch A",
      config: { message: "A", to: "userA" },
    });
    const branchB = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Branch B",
      config: { message: "B", to: "userB" },
    });
    const afterA = makeNode({
      id: "a3",
      type: "action",
      subtype: "send_message",
      label: "After A",
      config: { message: "post-A", to: "userA2" },
    });
    const afterB = makeNode({
      id: "a4",
      type: "action",
      subtype: "send_message",
      label: "After B",
      config: { message: "post-B", to: "userB2" },
    });

    const workflow = makeWorkflow(
      [trigger, branchA, branchB, afterA, afterB],
      [makeEdge("t1", "a1"), makeEdge("t1", "a2"), makeEdge("a1", "a3"), makeEdge("a2", "a4")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    expect(result.nodeResults).toHaveLength(5); // trigger + a1 + a2 + a3 + a4
    expect(deps.gatewayRpc).toHaveBeenCalledTimes(4);
    const nodeIds = result.nodeResults.map((r) => r.nodeId);
    expect(nodeIds).toContain("a3");
    expect(nodeIds).toContain("a4");
  });
});

// ── 9. Sub-Workflow Execution ───────────────────────────────────────

describe("Sub-Workflow Execution", () => {
  let deps: ActionDependencies;

  beforeEach(() => {
    deps = mockDeps();
  });

  it("executes a sub-workflow and returns its output", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      payload: { sent: true },
    });

    const subWorkflow = makeWorkflow(
      [
        makeNode({ id: "st1", type: "trigger", subtype: "manual", label: "Sub Trigger" }),
        makeNode({
          id: "sa1",
          type: "action",
          subtype: "send_message",
          label: "Sub Action",
          config: { message: "sub: {{symbol}}", to: "sub-user" },
        }),
      ],
      [makeEdge("st1", "sa1")],
      { id: "sub-wf-1", name: "Sub Workflow" },
    );

    deps.loadWorkflow = vi.fn().mockReturnValue(subWorkflow);

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const runSub = makeNode({
      id: "a1",
      type: "action",
      subtype: "run_workflow",
      label: "Run Sub",
      config: { workflowId: "sub-wf-1" },
    });

    const workflow = makeWorkflow([trigger, runSub], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { symbol: "BTC" });

    expect(result.status).toBe("completed");
    const subResult = result.nodeResults.find((r) => r.nodeId === "a1");
    expect(subResult).toBeDefined();
    expect(subResult!.status).toBe("success");
    expect(subResult!.output).toMatchObject({
      subWorkflowId: "sub-wf-1",
      subWorkflowName: "Sub Workflow",
      subStatus: "completed",
    });
    expect(deps.loadWorkflow).toHaveBeenCalledWith("sub-wf-1");
  });

  it("fails when target workflowId is missing", async () => {
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const runSub = makeNode({
      id: "a1",
      type: "action",
      subtype: "run_workflow",
      label: "No WF ID",
      config: {},
    });

    const workflow = makeWorkflow([trigger, runSub], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("workflowId is required");
  });

  it("fails when loadWorkflow is not available", async () => {
    // deps.loadWorkflow is undefined by default from mockDeps()
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const runSub = makeNode({
      id: "a1",
      type: "action",
      subtype: "run_workflow",
      label: "No Loader",
      config: { workflowId: "some-wf" },
    });

    const workflow = makeWorkflow([trigger, runSub], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("workflow loader not available");
  });

  it("fails when target workflow is not found", async () => {
    deps.loadWorkflow = vi.fn().mockReturnValue(null);

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const runSub = makeNode({
      id: "a1",
      type: "action",
      subtype: "run_workflow",
      label: "Missing WF",
      config: { workflowId: "nonexistent" },
    });

    const workflow = makeWorkflow([trigger, runSub], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("not found");
  });

  it("enforces recursion depth limit", async () => {
    // Create a sub-workflow that calls itself
    const selfWorkflow = makeWorkflow(
      [
        makeNode({ id: "st1", type: "trigger", subtype: "manual", label: "Self Trigger" }),
        makeNode({
          id: "sa1",
          type: "action",
          subtype: "run_workflow",
          label: "Self Call",
          config: { workflowId: "self-wf" },
        }),
      ],
      [makeEdge("st1", "sa1")],
      { id: "self-wf", name: "Self Workflow" },
    );

    deps.loadWorkflow = vi.fn().mockReturnValue(selfWorkflow);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(selfWorkflow, "st1", {});

    // Should eventually hit the recursion limit
    expect(result.status).toBe("failed");
    expect(result.error).toContain("recursion limit");
  });

  it("passes input mapping from parent to sub-workflow", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, payload: {} });

    const subWorkflow = makeWorkflow(
      [
        makeNode({ id: "st1", type: "trigger", subtype: "manual", label: "Sub Trigger" }),
        makeNode({
          id: "sa1",
          type: "action",
          subtype: "send_message",
          label: "Sub Send",
          config: { message: "got: {{asset}}", to: "user" },
        }),
      ],
      [makeEdge("st1", "sa1")],
      { id: "mapped-wf", name: "Mapped Sub" },
    );

    deps.loadWorkflow = vi.fn().mockReturnValue(subWorkflow);

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const runSub = makeNode({
      id: "a1",
      type: "action",
      subtype: "run_workflow",
      label: "Map & Run",
      config: {
        workflowId: "mapped-wf",
        inputMapping: { asset: "$symbol" },
      },
    });

    const workflow = makeWorkflow([trigger, runSub], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { symbol: "ETH" });

    expect(result.status).toBe("completed");
    // The sub-workflow should have received { asset: "ETH" } as trigger data
    const subResult = result.nodeResults.find((r) => r.nodeId === "a1");
    expect(subResult!.status).toBe("success");
  });

  it("sub-workflow failure propagates to parent", async () => {
    (deps.gatewayRpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "sub action failed",
    });

    const subWorkflow = makeWorkflow(
      [
        makeNode({ id: "st1", type: "trigger", subtype: "manual", label: "Sub Trigger" }),
        makeNode({
          id: "sa1",
          type: "action",
          subtype: "send_message",
          label: "Failing Sub Action",
          config: { message: "fail", to: "user" },
        }),
      ],
      [makeEdge("st1", "sa1")],
      { id: "fail-sub", name: "Failing Sub" },
    );

    deps.loadWorkflow = vi.fn().mockReturnValue(subWorkflow);

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const runSub = makeNode({
      id: "a1",
      type: "action",
      subtype: "run_workflow",
      label: "Run Failing Sub",
      config: { workflowId: "fail-sub" },
    });

    const workflow = makeWorkflow([trigger, runSub], [makeEdge("t1", "a1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Failing Sub");
    expect(result.error).toContain("failed");
  });
});

// ── Phase A: Router Nodes (If/Else + Switch) + Edge Routing ──────────

describe("Router: If/Else", () => {
  it("routes to 'true' branch when condition is met", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const ifNode = makeNode({
      id: "r1",
      type: "router" as WorkflowNode["type"],
      subtype: "if_else",
      label: "If Price > 100",
      config: { left: "$price", operator: ">", right: "100" },
      outputs: ["true", "false"],
    });
    const trueAction = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "True Branch",
      config: { channel: "test", template: "Price is high" },
    });
    const falseAction = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "False Branch",
      config: { channel: "test", template: "Price is low" },
    });

    const workflow = makeWorkflow(
      [trigger, ifNode, trueAction, falseAction],
      [makeEdge("t1", "r1"), makeEdge("r1", "a1", "true"), makeEdge("r1", "a2", "false")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { price: 150 });

    expect(result.status).toBe("completed");

    // True branch should execute
    const trueResult = result.nodeResults.find((n) => n.nodeId === "a1");
    expect(trueResult).toBeDefined();
    expect(trueResult!.status).toBe("success");

    // False branch should NOT execute
    const falseResult = result.nodeResults.find((n) => n.nodeId === "a2");
    expect(falseResult).toBeUndefined();
  });

  it("routes to 'false' branch when condition is not met", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const ifNode = makeNode({
      id: "r1",
      type: "router" as WorkflowNode["type"],
      subtype: "if_else",
      label: "If Price > 100",
      config: { left: "$price", operator: ">", right: "100" },
      outputs: ["true", "false"],
    });
    const trueAction = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "True Branch",
      config: { channel: "test", template: "Price is high" },
    });
    const falseAction = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "False Branch",
      config: { channel: "test", template: "Price is low" },
    });

    const workflow = makeWorkflow(
      [trigger, ifNode, trueAction, falseAction],
      [makeEdge("t1", "r1"), makeEdge("r1", "a1", "true"), makeEdge("r1", "a2", "false")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { price: 50 });

    expect(result.status).toBe("completed");

    // True branch should NOT execute
    const trueResult = result.nodeResults.find((n) => n.nodeId === "a1");
    expect(trueResult).toBeUndefined();

    // False branch should execute
    const falseResult = result.nodeResults.find((n) => n.nodeId === "a2");
    expect(falseResult).toBeDefined();
    expect(falseResult!.status).toBe("success");
  });

  it("records router result with selectedOutput in node output", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const ifNode = makeNode({
      id: "r1",
      type: "router" as WorkflowNode["type"],
      subtype: "if_else",
      label: "If",
      config: { left: "$x", operator: "==", right: "yes" },
    });

    const workflow = makeWorkflow([trigger, ifNode], [makeEdge("t1", "r1")]);

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { x: "yes" });

    const routerResult = result.nodeResults.find((n) => n.nodeId === "r1");
    expect(routerResult).toBeDefined();
    expect(routerResult!.status).toBe("success");
    expect(routerResult!.output?.selectedOutput).toBe("true");
  });
});

describe("Router: Switch", () => {
  it("routes to matching case", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const switchNode = makeNode({
      id: "r1",
      type: "router" as WorkflowNode["type"],
      subtype: "switch",
      label: "Switch on Status",
      config: {
        field: "$status",
        cases: [
          { value: "approved", output: "approved" },
          { value: "rejected", output: "rejected" },
        ],
        fallback: "default",
      },
    });
    const approvedAction = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Approved",
      config: { channel: "test", template: "Approved!" },
    });
    const rejectedAction = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Rejected",
      config: { channel: "test", template: "Rejected!" },
    });
    const defaultAction = makeNode({
      id: "a3",
      type: "action",
      subtype: "send_message",
      label: "Default",
      config: { channel: "test", template: "Unknown" },
    });

    const workflow = makeWorkflow(
      [trigger, switchNode, approvedAction, rejectedAction, defaultAction],
      [
        makeEdge("t1", "r1"),
        makeEdge("r1", "a1", "approved"),
        makeEdge("r1", "a2", "rejected"),
        makeEdge("r1", "a3", "default"),
      ],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { status: "rejected" });

    expect(result.status).toBe("completed");

    // Only the "rejected" branch should execute
    expect(result.nodeResults.find((n) => n.nodeId === "a1")).toBeUndefined();
    expect(result.nodeResults.find((n) => n.nodeId === "a2")?.status).toBe("success");
    expect(result.nodeResults.find((n) => n.nodeId === "a3")).toBeUndefined();
  });

  it("routes to fallback when no case matches", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const switchNode = makeNode({
      id: "r1",
      type: "router" as WorkflowNode["type"],
      subtype: "switch",
      label: "Switch on Status",
      config: {
        field: "$status",
        cases: [{ value: "approved", output: "approved" }],
        fallback: "other",
      },
    });
    const approvedAction = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Approved",
      config: { channel: "test", template: "Approved!" },
    });
    const otherAction = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Other",
      config: { channel: "test", template: "Fallback" },
    });

    const workflow = makeWorkflow(
      [trigger, switchNode, approvedAction, otherAction],
      [makeEdge("t1", "r1"), makeEdge("r1", "a1", "approved"), makeEdge("r1", "a2", "other")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { status: "pending" });

    expect(result.status).toBe("completed");
    expect(result.nodeResults.find((n) => n.nodeId === "a1")).toBeUndefined();
    expect(result.nodeResults.find((n) => n.nodeId === "a2")?.status).toBe("success");
  });
});

describe("Condition edge routing (match/no-match)", () => {
  it("follows no-match edge when condition is false", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const condition = makeNode({
      id: "c1",
      type: "condition",
      subtype: "expression",
      label: "Is Urgent",
      config: { left: "$priority", operator: "==", right: "urgent" },
    });
    const matchAction = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Match",
      config: { channel: "test", template: "Urgent!" },
    });
    const noMatchAction = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "No Match",
      config: { channel: "test", template: "Normal" },
    });

    const workflow = makeWorkflow(
      [trigger, condition, matchAction, noMatchAction],
      [makeEdge("t1", "c1"), makeEdge("c1", "a1", "match"), makeEdge("c1", "a2", "no-match")],
    );

    const engine = new WorkflowEngine(deps);

    // When condition matches
    const resultMatch = await engine.execute(workflow, "t1", { priority: "urgent" });
    expect(resultMatch.nodeResults.find((n) => n.nodeId === "a1")?.status).toBe("success");
    expect(resultMatch.nodeResults.find((n) => n.nodeId === "a2")).toBeUndefined();

    // When condition does NOT match
    const resultNoMatch = await engine.execute(workflow, "t1", { priority: "low" });
    expect(resultNoMatch.nodeResults.find((n) => n.nodeId === "a1")).toBeUndefined();
    expect(resultNoMatch.nodeResults.find((n) => n.nodeId === "a2")?.status).toBe("success");
  });
});

describe("Disabled node passthrough", () => {
  it("skips disabled nodes but continues traversal to successors", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const disabledAction = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Disabled Send",
      config: { channel: "test", template: "should not run" },
      disabled: true,
    });
    const nextAction = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "After Disabled",
      config: { channel: "test", template: "should run" },
    });

    const workflow = makeWorkflow(
      [trigger, disabledAction, nextAction],
      [makeEdge("t1", "a1"), makeEdge("a1", "a2")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");

    // Disabled node should be skipped
    const disabledResult = result.nodeResults.find((n) => n.nodeId === "a1");
    expect(disabledResult).toBeDefined();
    expect(disabledResult!.status).toBe("skipped");
    expect(disabledResult!.output?.disabled).toBe(true);

    // Next node should still execute
    const nextResult = result.nodeResults.find((n) => n.nodeId === "a2");
    expect(nextResult).toBeDefined();
    expect(nextResult!.status).toBe("success");
  });
});

// ── Merge Sync Barrier ────────────────────────────────────────────────

describe("Merge node sync barrier", () => {
  it("waits for all incoming branches before executing merge", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action1 = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Branch A",
      config: { channel: "test", template: "A" },
    });
    const action2 = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Branch B",
      config: { channel: "test", template: "B" },
    });
    const mergeNode = makeNode({
      id: "m1",
      type: "transform",
      subtype: "merge",
      label: "Merge",
      config: { mode: "append", outputKey: "merged" },
    });
    const finalAction = makeNode({
      id: "a3",
      type: "action",
      subtype: "send_message",
      label: "After Merge",
      config: { channel: "test", template: "done" },
    });

    // trigger -> a1, trigger -> a2, both -> merge -> final
    const workflow = makeWorkflow(
      [trigger, action1, action2, mergeNode, finalAction],
      [
        makeEdge("t1", "a1"),
        makeEdge("t1", "a2"),
        makeEdge("a1", "m1"),
        makeEdge("a2", "m1"),
        makeEdge("m1", "a3"),
      ],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");

    // Merge node should have executed exactly once
    const mergeResults = result.nodeResults.filter((n) => n.nodeId === "m1");
    expect(mergeResults).toHaveLength(1);
    expect(mergeResults[0].status).toBe("success");

    // Final action should have executed
    const finalResult = result.nodeResults.find((n) => n.nodeId === "a3");
    expect(finalResult).toBeDefined();
    expect(finalResult!.status).toBe("success");
  });

  it("merge with combine mode deep-merges branch outputs", async () => {
    const deps = mockDeps();
    deps.gatewayRpc = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, payload: { branchA: "valueA" } })
      .mockResolvedValueOnce({ ok: true, payload: { branchB: "valueB" } })
      .mockResolvedValue({ ok: true, payload: {} });

    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const action1 = makeNode({
      id: "a1",
      type: "action",
      subtype: "send_message",
      label: "Branch A",
      config: { channel: "test", template: "A" },
    });
    const action2 = makeNode({
      id: "a2",
      type: "action",
      subtype: "send_message",
      label: "Branch B",
      config: { channel: "test", template: "B" },
    });
    const mergeNode = makeNode({
      id: "m1",
      type: "transform",
      subtype: "merge",
      label: "Merge",
      config: { mode: "wait_all", outputKey: "merged" },
    });

    const workflow = makeWorkflow(
      [trigger, action1, action2, mergeNode],
      [makeEdge("t1", "a1"), makeEdge("t1", "a2"), makeEdge("a1", "m1"), makeEdge("a2", "m1")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1");

    expect(result.status).toBe("completed");
    const mergeResult = result.nodeResults.find((n) => n.nodeId === "m1");
    expect(mergeResult).toBeDefined();
    expect(mergeResult!.status).toBe("success");
    // wait_all mode returns branch count
    expect((mergeResult!.output as Record<string, unknown>)?.merged).toEqual({ branchCount: 2 });
  });
});

// ── Loop Iteration ────────────────────────────────────────────────────

describe("Loop node iteration", () => {
  it("iterates over an array, executing loop body per item", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const loopNode = makeNode({
      id: "loop1",
      type: "router",
      subtype: "loop",
      label: "Loop Items",
      config: { arrayPath: "$items", itemVariable: "item", indexVariable: "idx" },
      outputs: ["loop", "done"],
    });
    const bodyAction = makeNode({
      id: "body1",
      type: "action",
      subtype: "send_message",
      label: "Process Item",
      config: { channel: "test", template: "{{item}}" },
    });
    const doneAction = makeNode({
      id: "done1",
      type: "action",
      subtype: "send_message",
      label: "Done",
      config: { channel: "test", template: "finished" },
    });

    const workflow = makeWorkflow(
      [trigger, loopNode, bodyAction, doneAction],
      [
        makeEdge("t1", "loop1"),
        makeEdge("loop1", "body1", "loop"),
        makeEdge("loop1", "done1", "done"),
      ],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { items: ["a", "b", "c"] });

    expect(result.status).toBe("completed");

    // Loop body should execute 3 times (once per item)
    const bodyResults = result.nodeResults.filter((n) => n.nodeId === "body1");
    expect(bodyResults).toHaveLength(3);
    expect(bodyResults.every((r) => r.status === "success")).toBe(true);

    // Done action should execute once
    const doneResults = result.nodeResults.filter((n) => n.nodeId === "done1");
    expect(doneResults).toHaveLength(1);
    expect(doneResults[0].status).toBe("success");
  });

  it("skips to done when array is empty", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const loopNode = makeNode({
      id: "loop1",
      type: "router",
      subtype: "loop",
      label: "Loop Items",
      config: { arrayPath: "$items" },
      outputs: ["loop", "done"],
    });
    const bodyAction = makeNode({
      id: "body1",
      type: "action",
      subtype: "send_message",
      label: "Process Item",
      config: { channel: "test", template: "{{item}}" },
    });
    const doneAction = makeNode({
      id: "done1",
      type: "action",
      subtype: "send_message",
      label: "Done",
      config: { channel: "test", template: "finished" },
    });

    const workflow = makeWorkflow(
      [trigger, loopNode, bodyAction, doneAction],
      [
        makeEdge("t1", "loop1"),
        makeEdge("loop1", "body1", "loop"),
        makeEdge("loop1", "done1", "done"),
      ],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { items: [] });

    expect(result.status).toBe("completed");

    // Loop body should NOT execute
    const bodyResults = result.nodeResults.filter((n) => n.nodeId === "body1");
    expect(bodyResults).toHaveLength(0);

    // Done action should still execute
    const doneResults = result.nodeResults.filter((n) => n.nodeId === "done1");
    expect(doneResults).toHaveLength(1);
  });

  it("respects maxIterations limit", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const loopNode = makeNode({
      id: "loop1",
      type: "router",
      subtype: "loop",
      label: "Loop Items",
      config: { arrayPath: "$items", maxIterations: 2 },
      outputs: ["loop", "done"],
    });
    const bodyAction = makeNode({
      id: "body1",
      type: "action",
      subtype: "send_message",
      label: "Process Item",
      config: { channel: "test", template: "{{item}}" },
    });

    const workflow = makeWorkflow(
      [trigger, loopNode, bodyAction],
      [makeEdge("t1", "loop1"), makeEdge("loop1", "body1", "loop")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", { items: [1, 2, 3, 4, 5] });

    expect(result.status).toBe("completed");

    // Should only execute 2 iterations (maxIterations: 2)
    const bodyResults = result.nodeResults.filter((n) => n.nodeId === "body1");
    expect(bodyResults).toHaveLength(2);
  });

  it("handles missing array path gracefully", async () => {
    const deps = mockDeps();
    const trigger = makeNode({ id: "t1", type: "trigger", subtype: "manual", label: "Trigger" });
    const loopNode = makeNode({
      id: "loop1",
      type: "router",
      subtype: "loop",
      label: "Loop Items",
      config: { arrayPath: "$nonexistent" },
      outputs: ["loop", "done"],
    });
    const doneAction = makeNode({
      id: "done1",
      type: "action",
      subtype: "send_message",
      label: "Done",
      config: { channel: "test", template: "finished" },
    });

    const workflow = makeWorkflow(
      [trigger, loopNode, doneAction],
      [makeEdge("t1", "loop1"), makeEdge("loop1", "done1", "done")],
    );

    const engine = new WorkflowEngine(deps);
    const result = await engine.execute(workflow, "t1", {});

    expect(result.status).toBe("completed");
    // Should skip to done since array is undefined (treated as empty)
    const doneResults = result.nodeResults.filter((n) => n.nodeId === "done1");
    expect(doneResults).toHaveLength(1);
  });
});
