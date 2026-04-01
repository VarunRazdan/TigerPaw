/**
 * Execution context: carries data between workflow nodes and resolves templates.
 *
 * When a trigger fires, the context is seeded with trigger data.
 * Each subsequent node can read from and write to the context.
 * Templates like "Order {{symbol}} was {{status}}" are resolved against the context.
 */

import { evaluateExpression, isComplexExpression } from "./expressions.js";
import type { WorkflowItem } from "./types.js";

export class ExecutionContext {
  private data: Record<string, unknown>;
  private nodeOutputs: Map<string, WorkflowItem[]> = new Map();

  constructor(triggerData?: Record<string, unknown>) {
    this.data = triggerData ? structuredClone(triggerData) : {};
  }

  /** Get a top-level key. */
  get(key: string): unknown {
    return this.data[key];
  }

  /** Set a top-level key. */
  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  /** Merge an object into the context (shallow). */
  merge(obj: Record<string, unknown>): void {
    Object.assign(this.data, obj);
  }

  /**
   * Store a node's output items. Also merges items[0].json into the flat
   * data store for backward compatibility with existing {{key}} templates.
   */
  setNodeOutput(nodeId: string, items: WorkflowItem[]): void {
    this.nodeOutputs.set(nodeId, items);
    // Backward compat: merge first item's json into flat data
    if (items.length > 0 && items[0].json) {
      Object.assign(this.data, items[0].json);
    }
  }

  /** Get all items produced by a specific upstream node. */
  getNodeItems(nodeId: string): WorkflowItem[] {
    return this.nodeOutputs.get(nodeId) ?? [];
  }

  /** Get items from the most recently stored upstream node. */
  getAllItems(): WorkflowItem[] {
    const entries = [...this.nodeOutputs.entries()];
    if (entries.length === 0) {
      return [];
    }
    return entries[entries.length - 1][1];
  }

  /**
   * Access a value from a specific node's output via dot-path.
   * Supports `nodes.webhook_1.json.body.email` syntax.
   */
  getNodeOutput(nodeId: string, path: string): unknown {
    const items = this.nodeOutputs.get(nodeId);
    if (!items || items.length === 0) {
      return undefined;
    }
    const item = items[0];

    const segments = path.split(".");
    let current: unknown = item;
    for (const seg of segments) {
      if (current == null || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
    return current;
  }

  /**
   * Access a nested value via dot-path: "event.payload.symbol".
   * Returns undefined if any segment is missing.
   */
  getPath(path: string): unknown {
    const segments = path.split(".");

    // Support nodes.nodeId.json.path syntax for accessing specific node outputs
    if (segments[0] === "nodes" && segments.length >= 3) {
      const nodeId = segments[1];
      const rest = segments.slice(2).join(".");
      return this.getNodeOutput(nodeId, rest);
    }

    let current: unknown = this.data;
    for (const seg of segments) {
      if (current == null || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
    return current;
  }

  /**
   * Resolve a template string by replacing `{{expression}}` placeholders
   * with values from the context.
   *
   * - Simple paths: `{{symbol}}`, `{{event.payload.reason}}` → fast-path lookup
   * - Complex expressions: `{{uppercase(symbol)}}`, `{{price * 2}}` → expression engine
   * - Missing keys resolve to empty string.
   */
  resolveTemplate(template: string): string {
    return template.replace(/\{\{([\s\S]*?)\}\}/g, (_match, raw: string) => {
      const expr = raw.trim();
      if (!expr) {
        return "";
      }

      // Fast path: simple identifier or dot-path (no operators, no parens)
      if (!isComplexExpression(expr)) {
        const value = expr.includes(".") ? this.getPath(expr) : this.get(expr);
        if (value == null) {
          return "";
        }
        return typeof value === "string" ? value : String(value as number);
      }

      // Complex expression: delegate to expression engine
      try {
        const result = evaluateExpression(expr, this.data);
        if (result == null) {
          return "";
        }
        return typeof result === "string" ? result : String(result as number);
      } catch {
        // Expression evaluation failed — return empty string (safe default)
        return "";
      }
    });
  }

  /** Snapshot the current context as a plain object. */
  toJSON(): Record<string, unknown> {
    return structuredClone(this.data);
  }

  /** Full snapshot including node outputs. */
  toFullJSON(): { data: Record<string, unknown>; nodeOutputs: Record<string, WorkflowItem[]> } {
    const outputs: Record<string, WorkflowItem[]> = {};
    for (const [nodeId, items] of this.nodeOutputs) {
      outputs[nodeId] = structuredClone(items);
    }
    return { data: structuredClone(this.data), nodeOutputs: outputs };
  }

  /** Number of keys in the context. */
  get size(): number {
    return Object.keys(this.data).length;
  }
}
