/**
 * Unit tests for TriggerManager — registration, webhook HMAC,
 * rate limiting, unregistration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────

const mockUnsubscribe = vi.fn();
vi.mock("../../trading/event-emitter.js", () => ({
  onTradingEvent: vi.fn((_handler: unknown) => mockUnsubscribe),
}));

vi.mock("node:crypto", () => ({
  createHmac: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue("abcdef1234567890"),
  })),
  timingSafeEqual: vi.fn((a: Buffer, b: Buffer) => a.toString() === b.toString()),
  randomBytes: vi.fn((n: number) => Buffer.alloc(n, 0)),
}));

import { onTradingEvent } from "../../trading/event-emitter.js";
import { TriggerManager } from "../triggers.js";
import type { Workflow, WorkflowNode } from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeNode(partial: Partial<WorkflowNode> & { id: string }): WorkflowNode {
  return {
    type: "trigger",
    subtype: partial.subtype ?? "",
    label: partial.label ?? `trigger-${partial.id}`,
    config: partial.config ?? {},
    position: { x: 0, y: 0 },
    ...partial,
  };
}

function makeWorkflow(nodes: WorkflowNode[], overrides?: Partial<Workflow>): Workflow {
  return {
    id: overrides?.id ?? "wf-test",
    name: overrides?.name ?? "Test Workflow",
    description: "",
    enabled: overrides?.enabled ?? true,
    nodes,
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runCount: 0,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("TriggerManager", () => {
  let onTrigger: ReturnType<typeof vi.fn>;
  let mgr: TriggerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    onTrigger = vi.fn();
    mgr = new TriggerManager(onTrigger);
  });

  // ── Registration ───────────────────────────────────────────────────

  describe("registration", () => {
    it("re-registers by unregistering existing triggers first", async () => {
      const node = makeNode({
        id: "n1",
        subtype: "trading.event",
        config: { event: "trading.order.filled" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(1);

      // Re-register — old trigger cleaned up, new one added
      await mgr.registerWorkflow(wf);
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mgr.registeredCount).toBe(1);
    });

    it("skips registration when workflow is disabled", async () => {
      const node = makeNode({
        id: "n1",
        subtype: "trading.event",
        config: { event: "trading.order.filled" },
      });
      const wf = makeWorkflow([node], { enabled: false });
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(0);
    });

    it("registers a cron trigger when cronService is set", async () => {
      const mockCron = {
        getJob: vi.fn().mockReturnValue(null),
        add: vi.fn().mockResolvedValue({
          id: "j1",
          state: { lastRunAtMs: 0 },
        }),
        remove: vi.fn(),
      };
      mgr.setCronService(mockCron as never);

      const node = makeNode({
        id: "n-cron",
        subtype: "cron",
        config: { expression: "*/5 * * * *" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);

      expect(mgr.registeredCount).toBe(1);
      expect(mockCron.add).toHaveBeenCalled();
    });

    it("returns null for cron when no cronService", async () => {
      const node = makeNode({
        id: "n-cron",
        subtype: "cron",
        config: { expression: "*/5 * * * *" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(0);
    });

    it("registers trading event triggers", async () => {
      const node = makeNode({
        id: "n1",
        subtype: "trading.event",
        config: { event: "trading.order.filled" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);

      expect(onTradingEvent).toHaveBeenCalled();
      expect(mgr.registeredCount).toBe(1);
      expect(mgr.listRegistered()[0].type).toBe("trading.event");
    });

    it("registers specific trading.order.filled subtype trigger", async () => {
      const node = makeNode({ id: "n1", subtype: "trading.order.filled", config: {} });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(onTradingEvent).toHaveBeenCalled();
      expect(mgr.registeredCount).toBe(1);
    });

    it("registers webhook triggers", async () => {
      const node = makeNode({
        id: "n-wh",
        subtype: "webhook",
        config: { path: "my-hook", secret: "s3cr3t" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);

      expect(mgr.registeredCount).toBe(1);
      expect(mgr.listWebhooks()).toHaveLength(1);
      expect(mgr.listWebhooks()[0].path).toBe("my-hook");
    });

    it("returns null for manual triggers (no registration needed)", async () => {
      const node = makeNode({ id: "n-manual", subtype: "manual", config: {} });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(0);
    });

    it("returns null for unknown trigger subtypes", async () => {
      const node = makeNode({ id: "n-unk", subtype: "totally_unknown", config: {} });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(0);
    });

    it("registers message.received trigger as no-op", async () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const node = makeNode({ id: "n-msg", subtype: "message.received", config: {} });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(1);
      expect(mgr.listRegistered()[0].type).toBe("message.received");
      spy.mockRestore();
    });

    it("rejects webhook without secret", async () => {
      const node = makeNode({
        id: "n-wh",
        subtype: "webhook",
        config: { path: "no-secret" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(0);
    });

    it("rejects webhook without path", async () => {
      const node = makeNode({
        id: "n-wh",
        subtype: "webhook",
        config: { secret: "s3cr3t" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(0);
    });
  });

  // ── Webhook handling ───────────────────────────────────────────────

  describe("handleWebhook", () => {
    beforeEach(async () => {
      const node = makeNode({
        id: "n-wh",
        subtype: "webhook",
        config: { path: "test-hook", secret: "my-secret" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
    });

    it("returns false for a missing/unregistered path", () => {
      expect(mgr.handleWebhook("no-such-path", {})).toBe(false);
    });

    it("returns false when rate limit is exceeded (30 in 60s)", () => {
      // Exhaust the rate limit
      for (let i = 0; i < 30; i++) {
        mgr.handleWebhook(
          "test-hook",
          { i },
          {
            "x-webhook-signature": "sha256=abcdef1234567890",
          },
        );
      }
      // 31st should be rate-limited
      const result = mgr.handleWebhook(
        "test-hook",
        { extra: true },
        {
          "x-webhook-signature": "sha256=abcdef1234567890",
        },
      );
      expect(result).toBe(false);
    });

    it("returns false when HMAC signature is missing", () => {
      expect(mgr.handleWebhook("test-hook", {}, {})).toBe(false);
    });

    it("returns false when HMAC signature is invalid", () => {
      const { timingSafeEqual } = require("node:crypto") as {
        timingSafeEqual: ReturnType<typeof vi.fn>;
      };
      timingSafeEqual.mockReturnValueOnce(false);
      expect(mgr.handleWebhook("test-hook", {}, { "x-webhook-signature": "sha256=wrong" })).toBe(
        false,
      );
    });

    it("returns false for stale timestamp (>5min)", () => {
      const staleTs = String(Date.now() - 6 * 60 * 1000); // 6 minutes ago
      expect(
        mgr.handleWebhook(
          "test-hook",
          {},
          {
            "x-webhook-signature": "sha256=abcdef1234567890",
            "x-webhook-timestamp": staleTs,
          },
        ),
      ).toBe(false);
    });

    it("returns true for a valid request with correct HMAC", () => {
      const result = mgr.handleWebhook(
        "test-hook",
        { data: "value" },
        { "x-webhook-signature": "sha256=abcdef1234567890" },
      );
      expect(result).toBe(true);
    });

    it("converts seconds-precision timestamp to ms", () => {
      // Unix timestamp in seconds (10 digits) — should be treated as seconds
      const nowSec = String(Math.floor(Date.now() / 1000));
      const result = mgr.handleWebhook(
        "test-hook",
        {},
        {
          "x-webhook-signature": "sha256=abcdef1234567890",
          "x-webhook-timestamp": nowSec,
        },
      );
      expect(result).toBe(true);
    });

    it("fires onTrigger callback on valid webhook", () => {
      mgr.handleWebhook(
        "test-hook",
        { hello: "world" },
        { "x-webhook-signature": "sha256=abcdef1234567890" },
      );
      expect(onTrigger).toHaveBeenCalledTimes(1);
      expect(onTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ id: "wf-test" }),
        expect.objectContaining({ id: "n-wh" }),
        expect.objectContaining({ triggerType: "webhook", path: "test-hook" }),
      );
    });

    it("reads x-hub-signature-256 as fallback header", () => {
      const result = mgr.handleWebhook(
        "test-hook",
        { data: 1 },
        { "x-hub-signature-256": "sha256=abcdef1234567890" },
      );
      expect(result).toBe(true);
    });

    it("reads x-timestamp as fallback timestamp header", () => {
      const result = mgr.handleWebhook(
        "test-hook",
        {},
        {
          "x-webhook-signature": "sha256=abcdef1234567890",
          "x-timestamp": String(Date.now()),
        },
      );
      expect(result).toBe(true);
    });
  });

  // ── Unregistration ─────────────────────────────────────────────────

  describe("unregister", () => {
    it("cleans up triggers on unregisterWorkflow", async () => {
      const node = makeNode({
        id: "n1",
        subtype: "trading.event",
        config: { event: "trading.order.filled" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.registeredCount).toBe(1);

      await mgr.unregisterWorkflow("wf-test");
      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mgr.registeredCount).toBe(0);
    });

    it("removes webhook registrations on unregister", async () => {
      const node = makeNode({
        id: "n-wh",
        subtype: "webhook",
        config: { path: "to-remove", secret: "s3cr3t" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);
      expect(mgr.listWebhooks()).toHaveLength(1);

      await mgr.unregisterWorkflow("wf-test");
      expect(mgr.listWebhooks()).toHaveLength(0);
    });

    it("unregisterAll clears everything", async () => {
      const wf1 = makeWorkflow([makeNode({ id: "a", subtype: "trading.event", config: {} })], {
        id: "wf-1",
      });
      const wf2 = makeWorkflow(
        [makeNode({ id: "b", subtype: "webhook", config: { path: "x", secret: "s" } })],
        { id: "wf-2" },
      );
      await mgr.registerWorkflow(wf1);
      await mgr.registerWorkflow(wf2);
      expect(mgr.registeredCount).toBe(2);

      await mgr.unregisterAll();
      expect(mgr.registeredCount).toBe(0);
      expect(mgr.listWebhooks()).toHaveLength(0);
    });
  });

  // ── Diagnostics ────────────────────────────────────────────────────

  describe("diagnostics", () => {
    it("listRegistered returns trigger metadata", async () => {
      const node = makeNode({
        id: "n1",
        subtype: "trading.event",
        config: { event: "trading.order.filled" },
      });
      const wf = makeWorkflow([node]);
      await mgr.registerWorkflow(wf);

      const list = mgr.listRegistered();
      expect(list).toEqual([{ workflowId: "wf-test", nodeId: "n1", type: "trading.event" }]);
    });
  });
});
