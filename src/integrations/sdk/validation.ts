/**
 * SDK validation helpers for schemas and integration definitions.
 */

import type { IntegrationDefinition, JsonSchema } from "./types.js";

/**
 * Validate a JsonSchema structure. Returns an array of error strings (empty = valid).
 */
export function validateJsonSchema(schema: JsonSchema): string[] {
  const errors: string[] = [];

  if (!schema || typeof schema !== "object") {
    errors.push("Schema must be an object");
    return errors;
  }
  if (schema.type !== "object") {
    errors.push(`Schema type must be "object", got "${String(schema.type)}"`);
  }
  if (!schema.properties || typeof schema.properties !== "object") {
    errors.push("Schema must have a properties object");
    return errors;
  }

  const validTypes = new Set(["string", "number", "integer", "boolean", "array", "object"]);
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!prop || typeof prop !== "object") {
      errors.push(`Property "${key}" must be an object`);
      continue;
    }
    if (!prop.type || !validTypes.has(prop.type)) {
      errors.push(`Property "${key}" has invalid type "${prop.type}"`);
    }
    if (prop.enum !== undefined && !Array.isArray(prop.enum)) {
      errors.push(`Property "${key}" enum must be an array`);
    }
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required)) {
      errors.push("Schema required must be an array");
    } else {
      for (const key of schema.required) {
        if (!(key in schema.properties)) {
          errors.push(`Required field "${key}" not found in properties`);
        }
      }
    }
  }

  return errors;
}

/**
 * Validate input data against a JsonSchema. Returns validation result.
 */
export function validateInput(
  input: Record<string, unknown>,
  schema: JsonSchema,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  const requiredFields = schema.required ?? [];
  for (const key of requiredFields) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      errors.push(`Missing required field: "${key}"`);
    }
  }

  // Also check property-level required flags
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.required && (input[key] === undefined || input[key] === null || input[key] === "")) {
      if (!requiredFields.includes(key)) {
        errors.push(`Missing required field: "${key}"`);
      }
    }
  }

  // Type-check provided fields
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith("__")) {
      continue;
    } // Skip internal fields like __credentialId
    const prop = schema.properties[key];
    if (!prop) {
      continue;
    } // Extra fields are allowed

    if (value === undefined || value === null) {
      continue;
    }

    switch (prop.type) {
      case "string":
        if (typeof value !== "string") {
          errors.push(`Field "${key}" must be a string, got ${typeof value}`);
        }
        break;
      case "number":
      case "integer":
        if (typeof value !== "number") {
          errors.push(`Field "${key}" must be a number, got ${typeof value}`);
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`Field "${key}" must be a boolean, got ${typeof value}`);
        }
        break;
      case "array":
        if (!Array.isArray(value)) {
          errors.push(`Field "${key}" must be an array, got ${typeof value}`);
        }
        break;
      case "object":
        if (typeof value !== "object" || Array.isArray(value)) {
          errors.push(`Field "${key}" must be an object`);
        }
        break;
    }

    // Enum validation
    if (prop.enum && !prop.enum.includes(value)) {
      errors.push(`Field "${key}" must be one of: ${prop.enum.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an IntegrationDefinition. Returns an array of error strings.
 */
export function validateIntegrationDefinition(def: IntegrationDefinition): string[] {
  const errors: string[] = [];

  if (!def.id || typeof def.id !== "string") {
    errors.push("Integration must have a non-empty id");
  }
  if (!def.name || typeof def.name !== "string") {
    errors.push("Integration must have a non-empty name");
  }
  if (!def.category || typeof def.category !== "string") {
    errors.push("Integration must have a non-empty category");
  }

  const validAuthTypes = ["oauth2", "api_key", "bearer_token", "basic_auth", "none"];
  if (!def.auth || !validAuthTypes.includes(def.auth.type)) {
    errors.push(`Invalid auth type: "${def.auth?.type}"`);
  }

  if (def.auth?.type === "oauth2") {
    const oauth = def.auth;
    if (!oauth.authorizationUrl) {
      errors.push("OAuth2 requires authorizationUrl");
    }
    if (!oauth.tokenUrl) {
      errors.push("OAuth2 requires tokenUrl");
    }
    if (!oauth.clientIdEnvVar) {
      errors.push("OAuth2 requires clientIdEnvVar");
    }
    if (!oauth.clientSecretEnvVar) {
      errors.push("OAuth2 requires clientSecretEnvVar");
    }
  }

  if (!Array.isArray(def.actions)) {
    errors.push("Integration must have an actions array");
  } else {
    for (const action of def.actions) {
      if (!action.name) {
        errors.push("Action must have a name");
        continue;
      }
      if (!action.name.startsWith(`${def.id}.`)) {
        errors.push(`Action "${action.name}" must be prefixed with "${def.id}."`);
      }
      if (!action.execute || typeof action.execute !== "function") {
        errors.push(`Action "${action.name}" must have an execute function`);
      }
      errors.push(
        ...validateJsonSchema(action.inputSchema).map(
          (e) => `Action "${action.name}" inputSchema: ${e}`,
        ),
      );
      errors.push(
        ...validateJsonSchema(action.outputSchema).map(
          (e) => `Action "${action.name}" outputSchema: ${e}`,
        ),
      );
    }
  }

  if (!Array.isArray(def.triggers)) {
    errors.push("Integration must have a triggers array (can be empty)");
  } else {
    for (const trigger of def.triggers) {
      if (!trigger.name) {
        errors.push("Trigger must have a name");
        continue;
      }
      if (!trigger.name.startsWith(`${def.id}.`)) {
        errors.push(`Trigger "${trigger.name}" must be prefixed with "${def.id}."`);
      }
      if (trigger.type === "polling" && typeof trigger.poll !== "function") {
        errors.push(`Polling trigger "${trigger.name}" must have a poll function`);
      }
      if (trigger.type === "webhook") {
        if (typeof trigger.webhookSetup !== "function") {
          errors.push(`Webhook trigger "${trigger.name}" must have a webhookSetup function`);
        }
        if (typeof trigger.webhookParse !== "function") {
          errors.push(`Webhook trigger "${trigger.name}" must have a webhookParse function`);
        }
      }
    }
  }

  return errors;
}
