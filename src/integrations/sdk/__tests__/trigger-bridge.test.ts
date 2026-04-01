/**
 * Tests for the SDK trigger bridge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Workflow, WorkflowNode } from "../../../workflows/types.js";
import { registerSdkTrigger, type SdkTriggerResult } from "../trigger-bridge.js";
import type { IntegrationTriggerDef } from "../types.js";

// Mock createAuthContext
vi.mock("../auth-bridge.js", () => ({
  createAuthContext: vi.fn().mockResolvedValue({
    getAccessToken: async () => "test-token",
    getCredentialField: () => undefined,
    credentials: {},
  }),
}));

function makeWorkflow(id = "wf-1"): Workflow {
  return {
    id,
    name: "Test Workflow",
    description: "",
    enabled: true,
    nodes: [],
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runCount: 0,
  };
}

function makeNode(overrides?: Partial<WorkflowNode>): WorkflowNode {
  return {
    id: "node-1",
    type: "trigger",
    subtype: "test.trigger",
    label: "Test Trigger",
    config: {},
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

describe("SDK Trigger Bridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("registerSdkTrigger — polling", () => {
    it("registers a polling trigger with interval", () => {
      const triggerDef: IntegrationTriggerDef = {
        name: "test.poll",
        displayName: "Poll",
        description: "Test polling trigger",
        type: "polling",
        pollIntervalMs: 10_000,
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        poll: vi.fn().mockResolvedValue({ items: [], newState: null }),
      };

      const onTrigger = vi.fn();
      const result = registerSdkTrigger(makeWorkflow(), makeNode(), triggerDef, onTrigger);

      expect(result).not.toBeNull();
      expect(result!.workflowId).toBe("wf-1");
      expect(result!.nodeId).toBe("node-1");
      expect(result!.type).toBe("test.poll");

      // Cleanup should work without errors
      result!.cleanup();
    });

    it("calls poll function and emits items via callback", async () => {
      const pollFn = vi.fn().mockResolvedValue({
        items: [{ message: "hello" }, { message: "world" }],
        newState: "state-1",
      });

      const triggerDef: IntegrationTriggerDef = {
        name: "test.poll",
        displayName: "Poll",
        description: "desc",
        type: "polling",
        pollIntervalMs: 10_000,
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        poll: pollFn,
      };

      const onTrigger = vi.fn();
      const result = registerSdkTrigger(makeWorkflow(), makeNode(), triggerDef, onTrigger);

      // Advance past initial 5s delay
      await vi.advanceTimersByTimeAsync(5_001);

      expect(pollFn).toHaveBeenCalledTimes(1);
      expect(onTrigger).toHaveBeenCalledTimes(2);
      expect(onTrigger).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ message: "hello", triggerType: "test.poll" }),
      );

      result!.cleanup();
    });

    it("logs errors instead of swallowing them", async () => {
      const pollFn = vi.fn().mockRejectedValue(new Error("Auth expired"));
      const triggerDef: IntegrationTriggerDef = {
        name: "test.poll",
        displayName: "Poll",
        description: "desc",
        type: "polling",
        pollIntervalMs: 10_000,
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        poll: pollFn,
      };

      const errorLog = vi.fn();
      const onTrigger = vi.fn();
      const result = registerSdkTrigger(
        makeWorkflow(),
        makeNode(),
        triggerDef,
        onTrigger,
        errorLog,
      );

      await vi.advanceTimersByTimeAsync(5_001);

      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Auth expired"));
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("test.poll"));
      expect(onTrigger).not.toHaveBeenCalled();

      result!.cleanup();
    });

    it("cleanup clears interval and timeout", () => {
      const triggerDef: IntegrationTriggerDef = {
        name: "test.poll",
        displayName: "Poll",
        description: "desc",
        type: "polling",
        pollIntervalMs: 10_000,
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        poll: vi.fn().mockResolvedValue({ items: [], newState: null }),
      };

      const result = registerSdkTrigger(makeWorkflow(), makeNode(), triggerDef, vi.fn());
      result!.cleanup();

      // After cleanup, advancing timers should not trigger any poll
      vi.advanceTimersByTime(60_000);
      expect(triggerDef.poll).not.toHaveBeenCalled();
    });
  });

  describe("registerSdkTrigger — webhook", () => {
    it("returns webhook metadata for TriggerManager", () => {
      const triggerDef: IntegrationTriggerDef = {
        name: "test.webhook",
        displayName: "Webhook",
        description: "desc",
        type: "webhook",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        webhookSetup: vi.fn().mockResolvedValue({ path: "test-hook", secret: "s3cret" }),
        webhookParse: vi.fn().mockReturnValue([{ event: "push" }]),
      };

      const node = makeNode({
        config: { path: "/test-hook", secret: "s3cret" },
      });

      const result = registerSdkTrigger(
        makeWorkflow(),
        node,
        triggerDef,
        vi.fn(),
      ) as SdkTriggerResult;

      expect(result).not.toBeNull();
      expect(result.webhookPath).toBe("test-hook");
      expect(result.webhookSecret).toBe("s3cret");
      expect(result.webhookParse).toBe(triggerDef.webhookParse);
    });

    it("returns null when path or secret is missing", () => {
      const triggerDef: IntegrationTriggerDef = {
        name: "test.webhook",
        displayName: "Webhook",
        description: "desc",
        type: "webhook",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        webhookSetup: vi.fn(),
        webhookParse: vi.fn(),
      };

      // Missing secret
      const result = registerSdkTrigger(
        makeWorkflow(),
        makeNode({ config: { path: "hook" } }),
        triggerDef,
        vi.fn(),
      );

      expect(result).toBeNull();
    });
  });

  describe("registerSdkTrigger — unknown type", () => {
    it("returns null for unknown trigger type", () => {
      const triggerDef = {
        name: "test.unknown",
        displayName: "Unknown",
        description: "desc",
        type: "unknown" as "polling",
        inputSchema: { type: "object" as const, properties: {} },
        outputSchema: { type: "object" as const, properties: {} },
      };

      const result = registerSdkTrigger(makeWorkflow(), makeNode(), triggerDef, vi.fn());
      expect(result).toBeNull();
    });
  });
});
