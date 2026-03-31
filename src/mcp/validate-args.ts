/**
 * Strict parameter validation for MCP tool calls.
 *
 * Validates that supplied arguments match the declared JSON Schema
 * (required fields, types, enum membership) before execution.
 */

type SchemaProperty = {
  type: string;
  description?: string;
  enum?: (string | number | boolean)[];
};

type ToolInputSchema = {
  properties: Record<string, SchemaProperty>;
  required?: string[];
};

type ValidationResult = { valid: true } | { valid: false; error: string };

/**
 * Validate tool arguments against the tool's declared inputSchema.
 *
 * Checks:
 * 1. Required fields are present and not null/undefined
 * 2. Field types match the declared schema type (string, number, boolean)
 * 3. Enum membership for fields with an `enum` constraint
 *
 * Extra (undeclared) fields are allowed — the schema is not strict.
 */
export function validateToolArgs(
  tool: { inputSchema: ToolInputSchema },
  args: Record<string, unknown>,
): ValidationResult {
  const { properties, required } = tool.inputSchema;

  if (required) {
    for (const field of required) {
      if (args[field] === undefined || args[field] === null) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const schema = properties[key];
    if (!schema) continue;
    if (value === null || value === undefined) continue;

    const typeError = checkType(key, value, schema.type);
    if (typeError) return { valid: false, error: typeError };

    if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
      return {
        valid: false,
        error: `Invalid value for ${key}: "${String(value)}". Allowed: ${schema.enum.join(", ")}`,
      };
    }
  }

  return { valid: true };
}

function checkType(field: string, value: unknown, expectedType: string): string | null {
  switch (expectedType) {
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return `Expected number for ${field}, got ${typeof value === "number" ? "NaN" : typeof value}`;
      }
      return null;
    }
    case "string": {
      if (typeof value !== "string") {
        return `Expected string for ${field}, got ${typeof value}`;
      }
      return null;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return `Expected boolean for ${field}, got ${typeof value}`;
      }
      return null;
    }
    default:
      return null; // Unknown schema types pass through
  }
}
