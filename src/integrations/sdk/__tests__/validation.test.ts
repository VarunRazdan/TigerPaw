/**
 * Tests for SDK validation helpers.
 */

import { describe, it, expect } from "vitest";
import type { IntegrationDefinition, JsonSchema } from "../types.js";
import { validateJsonSchema, validateInput, validateIntegrationDefinition } from "../validation.js";

describe("validateJsonSchema", () => {
  it("accepts a valid schema", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        name: { type: "string", description: "A name" },
        count: { type: "number" },
      },
      required: ["name"],
    };
    expect(validateJsonSchema(schema)).toEqual([]);
  });

  it("rejects non-object type", () => {
    const schema = { type: "string", properties: {} } as unknown as JsonSchema;
    const errors = validateJsonSchema(schema);
    expect(errors).toContain('Schema type must be "object", got "string"');
  });

  it("rejects missing properties", () => {
    const schema = { type: "object" } as unknown as JsonSchema;
    const errors = validateJsonSchema(schema);
    expect(errors.some((e) => e.includes("properties"))).toBe(true);
  });

  it("rejects invalid property type", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        bad: { type: "invalid" as string },
      },
    };
    const errors = validateJsonSchema(schema);
    expect(errors.some((e) => e.includes('"bad"') && e.includes("invalid"))).toBe(true);
  });

  it("flags required field not in properties", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name", "missing"],
    };
    const errors = validateJsonSchema(schema);
    expect(errors.some((e) => e.includes('"missing"'))).toBe(true);
  });
});

describe("validateInput", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      name: { type: "string", required: true },
      count: { type: "number" },
      active: { type: "boolean" },
      tags: { type: "array" },
    },
    required: ["name"],
  };

  it("passes valid input", () => {
    const result = validateInput({ name: "test", count: 5 }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails on missing required field", () => {
    const result = validateInput({ count: 5 }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"name"'))).toBe(true);
  });

  it("fails on wrong type", () => {
    const result = validateInput({ name: "ok", count: "not_a_number" }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"count"'))).toBe(true);
  });

  it("validates boolean fields", () => {
    const result = validateInput({ name: "ok", active: "yes" }, schema);
    expect(result.valid).toBe(false);
  });

  it("validates array fields", () => {
    const result = validateInput({ name: "ok", tags: "not_array" }, schema);
    expect(result.valid).toBe(false);
  });

  it("allows extra fields not in schema", () => {
    const result = validateInput({ name: "ok", extra: "field" }, schema);
    expect(result.valid).toBe(true);
  });

  it("skips __internal fields", () => {
    const result = validateInput({ name: "ok", __credentialId: 123 }, schema);
    expect(result.valid).toBe(true);
  });

  it("validates enum constraints", () => {
    const enumSchema: JsonSchema = {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT"] },
      },
    };
    expect(validateInput({ method: "GET" }, enumSchema).valid).toBe(true);
    expect(validateInput({ method: "DELETE" }, enumSchema).valid).toBe(false);
  });
});

describe("validateIntegrationDefinition", () => {
  function validDef(): IntegrationDefinition {
    return {
      id: "test",
      name: "Test",
      description: "Test integration",
      icon: "test",
      category: "testing",
      auth: { type: "none" },
      actions: [
        {
          name: "test.action",
          displayName: "Action",
          description: "desc",
          inputSchema: { type: "object", properties: {} },
          outputSchema: { type: "object", properties: {} },
          execute: async () => ({}),
        },
      ],
      triggers: [],
    };
  }

  it("accepts a valid definition", () => {
    expect(validateIntegrationDefinition(validDef())).toEqual([]);
  });

  it("rejects empty ID", () => {
    const def = validDef();
    def.id = "";
    expect(validateIntegrationDefinition(def).length).toBeGreaterThan(0);
  });

  it("rejects action with wrong prefix", () => {
    const def = validDef();
    def.actions[0].name = "wrong.action";
    const errors = validateIntegrationDefinition(def);
    expect(errors.some((e) => e.includes("prefixed"))).toBe(true);
  });

  it("rejects action without execute function", () => {
    const def = validDef();
    (def.actions[0] as Record<string, unknown>).execute = "not_a_function";
    const errors = validateIntegrationDefinition(def);
    expect(errors.some((e) => e.includes("execute function"))).toBe(true);
  });

  it("validates OAuth2 auth config", () => {
    const def = validDef();
    def.auth = { type: "oauth2" } as IntegrationDefinition["auth"];
    const errors = validateIntegrationDefinition(def);
    expect(errors.some((e) => e.includes("authorizationUrl"))).toBe(true);
  });

  it("validates polling trigger has poll function", () => {
    const def = validDef();
    def.triggers = [
      {
        name: "test.trigger",
        displayName: "Trigger",
        description: "desc",
        type: "polling",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: {} },
      },
    ];
    const errors = validateIntegrationDefinition(def);
    expect(errors.some((e) => e.includes("poll function"))).toBe(true);
  });
});
