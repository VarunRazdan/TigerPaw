/**
 * Workflow schema utilities — upstream node traversal for expression autocomplete.
 *
 * Provides the data mapping layer that connects upstream node output schemas
 * to the ExpressionInput autocomplete dropdown.
 */

import { getPredecessorChain } from "./workflow-graph";

// ── Types ───────────────────────────────────────────────────────

export type SchemaProperty = {
  type: string;
  description?: string;
};

export type NodeOutputSchema = {
  properties: Record<string, SchemaProperty>;
  isArray?: boolean;
};

export type UpstreamNodeInfo = {
  nodeId: string;
  label: string;
  nodeType: string;
  subtype: string;
  schema: NodeOutputSchema;
};

/**
 * Token suggestion for the ExpressionInput autocomplete dropdown.
 */
export type ExpressionToken = {
  /** Full expression path: "nodes.webhook_1.json.body" or "symbol" */
  expression: string;
  /** Display label: "[Webhook] body" */
  label: string;
  /** Source node label */
  nodeLabel: string;
  /** Property type (string, number, object, etc.) */
  type: string;
  /** Optional description */
  description?: string;
};

// ── Node type/subtype for lookup ────────────────────────────────

type WorkflowNodeLike = {
  id: string;
  type: string;
  subtype: string;
  label: string;
};

type EdgeLike = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

// ── Static schema registry (client-side mirror) ─────────────────

const STATIC_SCHEMAS: Record<string, NodeOutputSchema> = {
  "trigger:cron": {
    properties: {
      triggerType: { type: "string" },
      expression: { type: "string" },
      firedAt: { type: "string" },
    },
  },
  "trigger:trading.event": {
    properties: {
      triggerType: { type: "string" },
      event: { type: "string" },
      timestamp: { type: "string" },
      symbol: { type: "string" },
      side: { type: "string" },
      quantity: { type: "number" },
    },
  },
  "trigger:message.received": {
    properties: {
      triggerType: { type: "string" },
      channel: { type: "string" },
      sender: { type: "string" },
      text: { type: "string" },
    },
  },
  "trigger:webhook": {
    properties: {
      triggerType: { type: "string" },
      path: { type: "string" },
      body: { type: "object" },
      receivedAt: { type: "string" },
    },
  },
  "trigger:manual": {
    properties: { triggerType: { type: "string" } },
  },
  "action:send_message": {
    properties: {
      sent: { type: "boolean" },
      channel: { type: "string" },
      messageId: { type: "string" },
    },
  },
  "action:call_webhook": {
    properties: {
      status: { type: "number" },
      body: { type: "object" },
      headers: { type: "object" },
    },
  },
  "action:run_llm_task": {
    properties: {
      response: { type: "string" },
      model: { type: "string" },
      tokensUsed: { type: "number" },
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
    },
  },
  "action:schedule_meeting": {
    properties: {
      meetingId: { type: "string" },
      joinUrl: { type: "string" },
    },
  },
  "transform:extract_data": {
    properties: { extracted: { type: "string" } },
  },
  "transform:format_text": {
    properties: { formatted: { type: "string" } },
  },
  "transform:parse_json": {
    properties: { parsed: { type: "object" } },
  },
  "transform:merge": {
    properties: { merged: { type: "object" } },
  },
  "router:loop": {
    properties: {
      item: { type: "object" },
      index: { type: "number" },
    },
  },
};

/**
 * Get all upstream nodes with their output schemas for a given node.
 * Used by ExpressionInput to populate the autocomplete dropdown.
 */
export function getUpstreamNodes(
  nodeId: string,
  nodes: WorkflowNodeLike[],
  edges: EdgeLike[],
  runtimeSchemas?: Map<string, NodeOutputSchema>,
): UpstreamNodeInfo[] {
  const chain = getPredecessorChain(nodeId, nodes, edges);
  // Remove the target node itself
  const ancestorIds = chain.filter((id) => id !== nodeId);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const result: UpstreamNodeInfo[] = [];

  for (const id of ancestorIds) {
    const node = nodeMap.get(id);
    if (!node) {
      continue;
    }

    // Prefer runtime schema (from actual execution), fall back to static
    const runtimeSchema = runtimeSchemas?.get(id);
    const staticSchema = STATIC_SCHEMAS[`${node.type}:${node.subtype}`];
    const schema = runtimeSchema ?? staticSchema ?? { properties: {} };

    result.push({
      nodeId: id,
      label: node.label,
      nodeType: node.type,
      subtype: node.subtype,
      schema,
    });
  }

  return result;
}

/**
 * Build a flat list of expression tokens from upstream nodes.
 * These tokens are what the autocomplete dropdown shows.
 */
export function buildExpressionTokens(upstreamNodes: UpstreamNodeInfo[]): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];

  for (const node of upstreamNodes) {
    for (const [key, prop] of Object.entries(node.schema.properties)) {
      tokens.push({
        expression: `nodes.${node.nodeId}.json.${key}`,
        label: key,
        nodeLabel: node.label,
        type: prop.type,
        description: prop.description,
      });

      // Also add a short form for the most recent upstream (direct predecessor)
      // This uses the flat context path: just the key name
      tokens.push({
        expression: key,
        label: key,
        nodeLabel: node.label,
        type: prop.type,
        description: prop.description,
      });
    }
  }

  // Deduplicate by expression (keep first occurrence — most recent upstream wins for short forms)
  const seen = new Set<string>();
  return tokens.filter((t) => {
    if (seen.has(t.expression)) {
      return false;
    }
    seen.add(t.expression);
    return true;
  });
}

/**
 * Merge a server-fetched schema map with runtime execution data.
 */
export function mergeRuntimeSchemas(
  staticSchemas: Record<string, NodeOutputSchema>,
  executionOutputs: Record<string, Record<string, unknown>>,
): Map<string, NodeOutputSchema> {
  const merged = new Map<string, NodeOutputSchema>();

  // Add static schemas
  for (const [key, schema] of Object.entries(staticSchemas)) {
    merged.set(key, schema);
  }

  // Overlay runtime schemas from execution outputs (keyed by nodeId)
  for (const [nodeId, output] of Object.entries(executionOutputs)) {
    const properties: Record<string, SchemaProperty> = {};
    for (const [key, value] of Object.entries(output)) {
      properties[key] = {
        type: inferType(value),
      };
    }
    merged.set(nodeId, { properties });
  }

  return merged;
}

function inferType(value: unknown): string {
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
