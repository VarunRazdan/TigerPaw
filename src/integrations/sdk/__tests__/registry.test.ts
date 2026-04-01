/**
 * Tests for the Integration SDK registry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerIntegration,
  getIntegration,
  listIntegrations,
  getAction,
  getTrigger,
  clearRegistry,
} from "../registry.js";
import type { IntegrationDefinition } from "../types.js";

function makeTestIntegration(
  id: string,
  overrides?: Partial<IntegrationDefinition>,
): IntegrationDefinition {
  return {
    id,
    name: `Test ${id}`,
    description: `Test integration ${id}`,
    icon: "test",
    category: "testing",
    auth: { type: "none" },
    actions: [
      {
        name: `${id}.test_action`,
        displayName: "Test Action",
        description: "A test action",
        inputSchema: { type: "object", properties: { input: { type: "string" } } },
        outputSchema: { type: "object", properties: { output: { type: "string" } } },
        execute: async () => ({ output: "ok" }),
      },
    ],
    triggers: [],
    ...overrides,
  };
}

describe("Integration SDK Registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe("registerIntegration", () => {
    it("registers a valid integration", () => {
      registerIntegration(makeTestIntegration("test1"));
      expect(getIntegration("test1")).toBeDefined();
      expect(getIntegration("test1")!.name).toBe("Test test1");
    });

    it("rejects duplicate IDs", () => {
      registerIntegration(makeTestIntegration("dup"));
      expect(() => registerIntegration(makeTestIntegration("dup"))).toThrow(
        'Integration "dup" is already registered',
      );
    });

    it("rejects invalid definitions (missing id)", () => {
      expect(() => registerIntegration({ ...makeTestIntegration(""), id: "" })).toThrow(
        "Invalid integration definition",
      );
    });

    it("rejects actions not prefixed with integration ID", () => {
      const def = makeTestIntegration("foo");
      def.actions[0].name = "bar.bad_prefix";
      expect(() => registerIntegration(def)).toThrow('must be prefixed with "foo."');
    });
  });

  describe("getIntegration", () => {
    it("returns undefined for unregistered IDs", () => {
      expect(getIntegration("nonexistent")).toBeUndefined();
    });

    it("returns the correct definition", () => {
      registerIntegration(makeTestIntegration("myint"));
      const def = getIntegration("myint");
      expect(def).toBeDefined();
      expect(def!.id).toBe("myint");
      expect(def!.category).toBe("testing");
    });
  });

  describe("listIntegrations", () => {
    it("returns empty array when no integrations registered", () => {
      expect(listIntegrations()).toEqual([]);
    });

    it("returns all registered integrations", () => {
      registerIntegration(makeTestIntegration("a"));
      registerIntegration(makeTestIntegration("b"));
      registerIntegration(makeTestIntegration("c"));
      expect(listIntegrations()).toHaveLength(3);
    });
  });

  describe("getAction", () => {
    it("finds an action by integration ID and action name", () => {
      registerIntegration(makeTestIntegration("myint"));
      const action = getAction("myint", "myint.test_action");
      expect(action).toBeDefined();
      expect(action!.displayName).toBe("Test Action");
    });

    it("returns undefined for non-existent action", () => {
      registerIntegration(makeTestIntegration("myint"));
      expect(getAction("myint", "myint.nope")).toBeUndefined();
    });

    it("returns undefined for non-existent integration", () => {
      expect(getAction("nope", "nope.action")).toBeUndefined();
    });
  });

  describe("getTrigger", () => {
    it("finds a trigger by integration ID and trigger name", () => {
      const def = makeTestIntegration("trig");
      def.triggers = [
        {
          name: "trig.on_event",
          displayName: "On Event",
          description: "Test trigger",
          type: "polling",
          inputSchema: { type: "object", properties: {} },
          outputSchema: { type: "object", properties: {} },
          poll: async () => ({ items: [], newState: null }),
        },
      ];
      registerIntegration(def);
      const trigger = getTrigger("trig", "trig.on_event");
      expect(trigger).toBeDefined();
      expect(trigger!.type).toBe("polling");
    });

    it("returns undefined when no triggers registered", () => {
      registerIntegration(makeTestIntegration("notrig"));
      expect(getTrigger("notrig", "notrig.event")).toBeUndefined();
    });
  });

  describe("clearRegistry", () => {
    it("removes all registrations", () => {
      registerIntegration(makeTestIntegration("x"));
      registerIntegration(makeTestIntegration("y"));
      expect(listIntegrations()).toHaveLength(2);
      clearRegistry();
      expect(listIntegrations()).toHaveLength(0);
    });
  });
});
