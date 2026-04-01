/**
 * Output Schema Registry — static schemas for known node types
 * and runtime schema inference from execution items.
 *
 * Used by the visual data mapping UI to show available upstream
 * node outputs as selectable tokens in the ExpressionInput.
 */

import type { NodeOutputSchema, WorkflowItem } from "./types.js";

// ── Static schema registry ──────────────────────────────────────

const STATIC_SCHEMAS: Record<string, NodeOutputSchema> = {
  // Triggers
  "trigger:cron": {
    properties: {
      triggerType: { type: "string", description: "Always 'cron'" },
      expression: { type: "string", description: "Cron expression" },
      firedAt: { type: "string", description: "ISO timestamp of trigger" },
    },
  },
  "trigger:trading.event": {
    properties: {
      triggerType: { type: "string" },
      event: { type: "string", description: "Event type name" },
      timestamp: { type: "string" },
      symbol: { type: "string" },
      side: { type: "string" },
      quantity: { type: "number" },
    },
  },
  "trigger:message.received": {
    properties: {
      triggerType: { type: "string" },
      channel: { type: "string", description: "Source channel" },
      sender: { type: "string", description: "Message sender" },
      text: { type: "string", description: "Message content" },
    },
  },
  "trigger:webhook": {
    properties: {
      triggerType: { type: "string" },
      path: { type: "string", description: "Webhook path" },
      body: { type: "object", description: "Request body" },
      receivedAt: { type: "string" },
    },
  },
  "trigger:manual": {
    properties: {
      triggerType: { type: "string" },
    },
  },

  // Actions
  "action:send_message": {
    properties: {
      sent: { type: "boolean" },
      channel: { type: "string" },
      messageId: { type: "string" },
    },
  },
  "action:call_webhook": {
    properties: {
      status: { type: "number", description: "HTTP status code" },
      body: { type: "object", description: "Response body" },
      headers: { type: "object" },
    },
  },
  "action:run_llm_task": {
    properties: {
      response: { type: "string", description: "LLM response text" },
      model: { type: "string" },
      tokensUsed: { type: "number" },
    },
  },
  "action:killswitch": {
    properties: {
      active: { type: "boolean", description: "Kill switch state" },
      reason: { type: "string" },
    },
  },
  "action:trade": {
    properties: {
      orderId: { type: "string" },
      status: { type: "string" },
      symbol: { type: "string" },
      side: { type: "string" },
      quantity: { type: "number" },
      price: { type: "number" },
    },
  },
  "action:send_email": {
    properties: {
      messageId: { type: "string" },
      to: { type: "string" },
      subject: { type: "string" },
    },
  },
  "action:create_calendar_event": {
    properties: {
      eventId: { type: "string" },
      htmlLink: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
    },
  },
  "action:schedule_meeting": {
    properties: {
      meetingId: { type: "string" },
      joinUrl: { type: "string" },
      startTime: { type: "string" },
    },
  },

  // Transforms
  "transform:extract_data": {
    properties: {
      extracted: { type: "string", description: "Extracted value" },
    },
  },
  "transform:format_text": {
    properties: {
      formatted: { type: "string", description: "Formatted text" },
    },
  },
  "transform:parse_json": {
    properties: {
      parsed: { type: "object", description: "Parsed JSON data" },
    },
  },
  "transform:merge": {
    properties: {
      merged: { type: "object", description: "Merged data" },
    },
  },

  // Conditions (pass-through — output equals input)
  "condition:contains_keyword": { properties: {} },
  "condition:sender_matches": { properties: {} },
  "condition:channel_is": { properties: {} },
  "condition:time_of_day": { properties: {} },
  "condition:expression": { properties: {} },

  // Routers
  "router:if_else": { properties: {} },
  "router:switch": { properties: {} },
  "router:loop": {
    properties: {
      item: { type: "object", description: "Current loop item" },
      index: { type: "number", description: "Current loop index" },
    },
  },
};

/**
 * Get the static output schema for a node type:subtype combo.
 */
export function getStaticSchema(nodeType: string, subtype: string): NodeOutputSchema | undefined {
  return STATIC_SCHEMAS[`${nodeType}:${subtype}`];
}

/**
 * Get all static schemas (for the gateway RPC endpoint).
 */
export function getAllStaticSchemas(): Record<string, NodeOutputSchema> {
  return { ...STATIC_SCHEMAS };
}

// ── Runtime schema inference ────────────────────────────────────

/**
 * Infer an output schema from actual execution items.
 * Merges property names/types from all items to build a complete schema.
 */
export function inferSchemaFromItems(items: WorkflowItem[]): NodeOutputSchema {
  const properties: NodeOutputSchema["properties"] = {};
  let isArray = false;

  if (items.length > 1) {
    isArray = true;
  }

  for (const item of items) {
    for (const [key, value] of Object.entries(item.json)) {
      if (properties[key]) {
        continue;
      } // First occurrence wins

      properties[key] = {
        type: inferJsType(value),
        description: undefined,
      };
    }
  }

  return { properties, isArray };
}

/**
 * Infer schema from a plain record (e.g., execution output snapshot).
 */
export function inferSchemaFromRecord(record: Record<string, unknown>): NodeOutputSchema {
  const properties: NodeOutputSchema["properties"] = {};

  for (const [key, value] of Object.entries(record)) {
    properties[key] = {
      type: inferJsType(value),
      description: undefined,
    };
  }

  return { properties };
}

function inferJsType(value: unknown): string {
  if (value === null || value === undefined) {
    return "string";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "object") {
    return "object";
  }
  return "string";
}
