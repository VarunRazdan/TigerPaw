/**
 * Tests for the workflow output schema registry.
 */

import { describe, it, expect } from "vitest";
import {
  getStaticSchema,
  getAllStaticSchemas,
  inferSchemaFromItems,
  inferSchemaFromRecord,
} from "../schemas.js";
import type { WorkflowItem } from "../types.js";

describe("Schema Registry", () => {
  describe("getStaticSchema", () => {
    it("returns schema for known trigger subtypes", () => {
      const schema = getStaticSchema("trigger", "webhook");
      expect(schema).toBeDefined();
      expect(schema!.properties.body).toBeDefined();
      expect(schema!.properties.body.type).toBe("object");
    });

    it("returns schema for known action subtypes", () => {
      const schema = getStaticSchema("action", "trade");
      expect(schema).toBeDefined();
      expect(schema!.properties.orderId).toBeDefined();
      expect(schema!.properties.symbol).toBeDefined();
      expect(schema!.properties.price.type).toBe("number");
    });

    it("returns schema for transform subtypes", () => {
      const schema = getStaticSchema("transform", "extract_data");
      expect(schema).toBeDefined();
      expect(schema!.properties.extracted).toBeDefined();
    });

    it("returns schema for router loop with item/index", () => {
      const schema = getStaticSchema("router", "loop");
      expect(schema).toBeDefined();
      expect(schema!.properties.item.type).toBe("object");
      expect(schema!.properties.index.type).toBe("number");
    });

    it("returns empty properties for pass-through conditions", () => {
      const schema = getStaticSchema("condition", "contains_keyword");
      expect(schema).toBeDefined();
      expect(Object.keys(schema!.properties)).toHaveLength(0);
    });

    it("returns undefined for unknown type:subtype", () => {
      expect(getStaticSchema("unknown", "type")).toBeUndefined();
    });

    it("returns schema for all email/calendar/meeting actions", () => {
      expect(getStaticSchema("action", "send_email")).toBeDefined();
      expect(getStaticSchema("action", "create_calendar_event")).toBeDefined();
      expect(getStaticSchema("action", "schedule_meeting")).toBeDefined();
    });
  });

  describe("getAllStaticSchemas", () => {
    it("returns all registered schemas", () => {
      const all = getAllStaticSchemas();
      expect(Object.keys(all).length).toBeGreaterThan(15);
      // Verify it's a copy, not the internal object
      all["trigger:cron"] = { properties: {} };
      const fresh = getAllStaticSchemas();
      expect(Object.keys(fresh["trigger:cron"].properties).length).toBeGreaterThan(0);
    });
  });

  describe("inferSchemaFromItems", () => {
    it("infers schema from a single item", () => {
      const items: WorkflowItem[] = [{ json: { name: "Alice", age: 30, active: true } }];
      const schema = inferSchemaFromItems(items);
      expect(schema.properties.name.type).toBe("string");
      expect(schema.properties.age.type).toBe("number");
      expect(schema.properties.active.type).toBe("boolean");
      expect(schema.isArray).toBeFalsy();
    });

    it("sets isArray when multiple items", () => {
      const items: WorkflowItem[] = [{ json: { id: 1 } }, { json: { id: 2 } }];
      const schema = inferSchemaFromItems(items);
      expect(schema.isArray).toBe(true);
    });

    it("merges properties from multiple items", () => {
      const items: WorkflowItem[] = [{ json: { a: "x" } }, { json: { a: "y", b: 42 } }];
      const schema = inferSchemaFromItems(items);
      expect(schema.properties.a.type).toBe("string");
      expect(schema.properties.b.type).toBe("number");
    });

    it("handles empty items array", () => {
      const schema = inferSchemaFromItems([]);
      expect(Object.keys(schema.properties)).toHaveLength(0);
    });

    it("infers array type", () => {
      const items: WorkflowItem[] = [{ json: { tags: ["a", "b"] } }];
      const schema = inferSchemaFromItems(items);
      expect(schema.properties.tags.type).toBe("array");
    });

    it("infers object type", () => {
      const items: WorkflowItem[] = [{ json: { nested: { x: 1 } } }];
      const schema = inferSchemaFromItems(items);
      expect(schema.properties.nested.type).toBe("object");
    });

    it("treats null as string type", () => {
      const items: WorkflowItem[] = [{ json: { value: null } }];
      const schema = inferSchemaFromItems(items);
      expect(schema.properties.value.type).toBe("string");
    });
  });

  describe("inferSchemaFromRecord", () => {
    it("infers schema from a plain record", () => {
      const schema = inferSchemaFromRecord({
        status: "ok",
        count: 5,
        items: [1, 2, 3],
        meta: { version: 1 },
      });
      expect(schema.properties.status.type).toBe("string");
      expect(schema.properties.count.type).toBe("number");
      expect(schema.properties.items.type).toBe("array");
      expect(schema.properties.meta.type).toBe("object");
    });

    it("handles empty record", () => {
      const schema = inferSchemaFromRecord({});
      expect(Object.keys(schema.properties)).toHaveLength(0);
    });
  });
});
