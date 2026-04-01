/**
 * UI Schema converter — transforms JsonSchema into NODE_CONFIG_FIELDS format.
 *
 * Used by the WorkflowEditorPage to dynamically generate config panels
 * for SDK integration actions and triggers.
 */

import type { JsonSchema } from "./types.js";

export type ConfigField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
  required?: boolean;
};

/**
 * Convert a JsonSchema to an array of UI config fields.
 *
 * Mapping rules:
 * - string + enum -> select with options
 * - string + format:"textarea" -> textarea
 * - string (no enum) -> text
 * - number/integer -> number
 * - boolean -> select with ["true", "false"]
 * - array/object -> textarea (JSON input)
 */
export function jsonSchemaToConfigFields(schema: JsonSchema): ConfigField[] {
  if (!schema?.properties) {
    return [];
  }

  const requiredSet = new Set(schema.required ?? []);
  const fields: ConfigField[] = [];

  for (const [key, prop] of Object.entries(schema.properties)) {
    const isRequired = requiredSet.has(key) || prop.required === true;
    const label = formatLabel(key);
    const placeholder = prop.description ?? "";

    if (prop.enum && prop.enum.length > 0) {
      fields.push({
        key,
        label,
        type: "select",
        options: prop.enum.map(String),
        placeholder,
        required: isRequired,
      });
      continue;
    }

    switch (prop.type) {
      case "string":
        if (prop.format === "textarea" || isTextareaField(key, prop.description)) {
          fields.push({ key, label, type: "textarea", placeholder, required: isRequired });
        } else {
          fields.push({ key, label, type: "text", placeholder, required: isRequired });
        }
        break;

      case "number":
      case "integer":
        fields.push({ key, label, type: "number", placeholder, required: isRequired });
        break;

      case "boolean":
        fields.push({
          key,
          label,
          type: "select",
          options: ["true", "false"],
          placeholder,
          required: isRequired,
        });
        break;

      case "array":
      case "object":
        // Complex types rendered as JSON textarea
        fields.push({
          key,
          label,
          type: "textarea",
          placeholder: placeholder || "JSON",
          required: isRequired,
        });
        break;

      default:
        fields.push({ key, label, type: "text", placeholder, required: isRequired });
    }
  }

  return fields;
}

/** Convert snake_case/camelCase to Title Case. */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Heuristic: fields likely to be multi-line. */
function isTextareaField(key: string, description?: string): boolean {
  const textareaHints = [
    "body",
    "message",
    "content",
    "template",
    "prompt",
    "system",
    "text",
    "description",
  ];
  const lowerKey = key.toLowerCase();
  if (textareaHints.some((h) => lowerKey.includes(h))) {
    return true;
  }
  if (description && /multi.?line|paragraph|template|body/i.test(description)) {
    return true;
  }
  return false;
}
