/**
 * Transform processors for workflow transform nodes.
 *
 * Transforms modify or extract data in the execution context.
 * They don't have side effects — they only reshape data.
 */

import type { ExecutionContext } from "./context.js";
import type { WorkflowItem } from "./types.js";

/** Wrap a legacy Record output as a single WorkflowItem. */
function wrapOutput(output: Record<string, unknown>): WorkflowItem[] {
  return [{ json: output }];
}

type TransformProcessor = (
  config: Record<string, unknown>,
  ctx: ExecutionContext,
) => WorkflowItem[];

// ── Extract Data ──────────────────────────────────────────────────

function extractData(config: Record<string, unknown>, ctx: ExecutionContext): WorkflowItem[] {
  const path = (config.path as string | undefined) ?? "";
  const outputKey = (config.outputKey as string | undefined) ?? "extracted";

  if (!path) {
    throw new Error("extract_data: path is required");
  }

  const value = ctx.getPath(path);
  return wrapOutput({ [outputKey]: value });
}

// ── Format Text ───────────────────────────────────────────────────

function formatText(config: Record<string, unknown>, ctx: ExecutionContext): WorkflowItem[] {
  const template = (config.template as string | undefined) ?? "";
  const outputKey = (config.outputKey as string | undefined) ?? "formatted";

  if (!template) {
    throw new Error("format_text: template is required");
  }

  const result = ctx.resolveTemplate(template);
  return wrapOutput({ [outputKey]: result });
}

// ── Parse JSON ────────────────────────────────────────────────────

function parseJson(config: Record<string, unknown>, ctx: ExecutionContext): WorkflowItem[] {
  const inputKey = (config.inputKey as string | undefined) ?? "webhookResponse";
  const outputKey = (config.outputKey as string | undefined) ?? "parsed";

  const raw = ctx.get(inputKey);
  if (raw == null) {
    throw new Error(`parse_json: no value at key "${inputKey}"`);
  }

  if (typeof raw === "object") {
    // Already parsed
    return wrapOutput({ [outputKey]: raw });
  }

  const parsed: unknown = JSON.parse(raw as string);
  return wrapOutput({ [outputKey]: parsed });
}

// ── Merge ─────────────────────────────────────────────────────────

function merge(config: Record<string, unknown>, ctx: ExecutionContext): WorkflowItem[] {
  const mode = (config.mode as string | undefined) ?? "append";
  const outputKey = (config.outputKey as string | undefined) ?? "merged";

  // The engine injects collected branch outputs into __branchOutputs
  const branchOutputs = (ctx.get("__branchOutputs") as Record<string, unknown>[] | undefined) ?? [];

  switch (mode) {
    case "append": {
      // Concatenate all branch outputs into an array
      return wrapOutput({ [outputKey]: branchOutputs });
    }
    case "combine": {
      // Deep-merge all branch outputs into a single object
      const combined: Record<string, unknown> = {};
      for (const output of branchOutputs) {
        Object.assign(combined, output);
      }
      return wrapOutput({ [outputKey]: combined });
    }
    case "wait_all":
    default: {
      // Just synchronize — pass through the count
      return wrapOutput({ [outputKey]: { branchCount: branchOutputs.length } });
    }
  }
}

// ── Registry ──────────────────────────────────────────────────────

const processors: Record<string, TransformProcessor> = {
  extract_data: extractData,
  format_text: formatText,
  parse_json: parseJson,
  merge,
};

/**
 * Execute a transform node. Returns output data to merge into the execution context.
 * Throws on failure.
 */
export function executeTransform(
  subtype: string,
  config: Record<string, unknown>,
  ctx: ExecutionContext,
): WorkflowItem[] {
  const processor = processors[subtype];
  if (!processor) {
    throw new Error(`Unknown transform subtype: ${subtype}`);
  }
  return processor(config, ctx);
}

/** List all supported transform subtypes. */
export function supportedTransforms(): string[] {
  return Object.keys(processors);
}
