/**
 * Tests for the SDK action bridge.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExecutionContext } from "../../../workflows/context.js";
import type { ActionDependencies } from "../../../workflows/types.js";
import { createSdkActionExecutor } from "../action-bridge.js";
import { registerIntegration, clearRegistry } from "../registry.js";
import type { IntegrationDefinition } from "../types.js";

function mockDeps(): ActionDependencies {
  return {
    gatewayRpc: vi.fn().mockResolvedValue({ ok: true, payload: {} }),
    killSwitch: {
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue({ active: false }),
    },
    log: vi.fn(),
    resolveCredential: vi.fn().mockReturnValue({ apiKey: "test-key-123" }),
  };
}

function registerTestIntegration(): IntegrationDefinition {
  const def: IntegrationDefinition = {
    id: "testint",
    name: "Test Integration",
    description: "For testing the action bridge",
    icon: "test",
    category: "testing",
    auth: { type: "api_key", envVar: "TEST_API_KEY" },
    actions: [
      {
        name: "testint.echo",
        displayName: "Echo",
        description: "Returns the input as output",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", required: true },
            count: { type: "number" },
          },
          required: ["message"],
        },
        outputSchema: {
          type: "object",
          properties: { echoed: { type: "string" } },
        },
        execute: async (input) => ({
          echoed: String(input.message),
          count: input.count ?? 0,
        }),
      },
      {
        name: "testint.fail",
        displayName: "Fail",
        description: "Always throws",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
        execute: async () => {
          throw new Error("Intentional failure");
        },
      },
    ],
    triggers: [],
  };
  registerIntegration(def);
  return def;
}

describe("SDK Action Bridge", () => {
  beforeEach(() => {
    clearRegistry();
    // Set env var for API key fallback
    process.env.TEST_API_KEY = "env-test-key";
  });

  describe("createSdkActionExecutor", () => {
    it("returns null for unregistered integration", () => {
      expect(createSdkActionExecutor("nope", "nope.action")).toBeNull();
    });

    it("returns null for unregistered action", () => {
      registerTestIntegration();
      expect(createSdkActionExecutor("testint", "testint.nonexistent")).toBeNull();
    });

    it("returns an executor for registered action", () => {
      registerTestIntegration();
      const executor = createSdkActionExecutor("testint", "testint.echo");
      expect(executor).not.toBeNull();
      expect(typeof executor).toBe("function");
    });
  });

  describe("executor execution", () => {
    it("executes successfully with valid input", async () => {
      registerTestIntegration();
      const executor = createSdkActionExecutor("testint", "testint.echo")!;
      const ctx = new ExecutionContext();
      const deps = mockDeps();

      const result = await executor({ message: "hello", count: 42 }, ctx, deps);

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ echoed: "hello", count: 42 });
    });

    it("resolves template expressions in config", async () => {
      registerTestIntegration();
      const executor = createSdkActionExecutor("testint", "testint.echo")!;
      const ctx = new ExecutionContext();
      ctx.merge({ greeting: "world" });
      const deps = mockDeps();

      const result = await executor({ message: "{{greeting}}" }, ctx, deps);

      expect(result[0].json.echoed).toBe("world");
    });

    it("throws on missing required field", async () => {
      registerTestIntegration();
      const executor = createSdkActionExecutor("testint", "testint.echo")!;
      const ctx = new ExecutionContext();
      const deps = mockDeps();

      await expect(executor({}, ctx, deps)).rejects.toThrow("Invalid input");
    });

    it("propagates action execution errors", async () => {
      registerTestIntegration();
      const executor = createSdkActionExecutor("testint", "testint.fail")!;
      const ctx = new ExecutionContext();
      const deps = mockDeps();

      await expect(executor({}, ctx, deps)).rejects.toThrow("Intentional failure");
    });

    it("logs execution via deps.log", async () => {
      registerTestIntegration();
      const executor = createSdkActionExecutor("testint", "testint.echo")!;
      const ctx = new ExecutionContext();
      const deps = mockDeps();

      await executor({ message: "test" }, ctx, deps);

      expect(deps.log).toHaveBeenCalledWith("Executing SDK action: testint.echo");
    });

    it("skips __internal config fields during validation", async () => {
      registerTestIntegration();
      const executor = createSdkActionExecutor("testint", "testint.echo")!;
      const ctx = new ExecutionContext();
      const deps = mockDeps();

      const result = await executor({ message: "ok", __credentialId: "cred-123" }, ctx, deps);

      expect(result[0].json.echoed).toBe("ok");
    });
  });
});
