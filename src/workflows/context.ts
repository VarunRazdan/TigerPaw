/**
 * Execution context: carries data between workflow nodes and resolves templates.
 *
 * When a trigger fires, the context is seeded with trigger data.
 * Each subsequent node can read from and write to the context.
 * Templates like "Order {{symbol}} was {{status}}" are resolved against the context.
 */

export class ExecutionContext {
  private data: Record<string, unknown>;

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
   * Access a nested value via dot-path: "event.payload.symbol".
   * Returns undefined if any segment is missing.
   */
  getPath(path: string): unknown {
    const segments = path.split(".");
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
   * Resolve a template string by replacing `{{key}}` and `{{path.to.value}}`
   * with values from the context.
   *
   * - `{{symbol}}` → context.get("symbol")
   * - `{{event.payload.reason}}` → context.getPath("event.payload.reason")
   * - Missing keys resolve to empty string.
   */
  resolveTemplate(template: string): string {
    return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_match, key: string) => {
      const trimmed = key.trim();
      const value = trimmed.includes(".") ? this.getPath(trimmed) : this.get(trimmed);
      if (value == null) {
        return "";
      }
      return typeof value === "string" ? value : String(value as number);
    });
  }

  /** Snapshot the current context as a plain object. */
  toJSON(): Record<string, unknown> {
    return structuredClone(this.data);
  }

  /** Number of keys in the context. */
  get size(): number {
    return Object.keys(this.data).length;
  }
}
