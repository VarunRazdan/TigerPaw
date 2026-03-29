/**
 * Transform processors for workflow transform nodes.
 *
 * Transforms modify or extract data in the execution context.
 * They don't have side effects — they only reshape data.
 */

import type { ExecutionContext } from "./context.js";

type TransformProcessor = (
  config: Record<string, unknown>,
  ctx: ExecutionContext,
) => Record<string, unknown>;

// ── Extract Data ──────────────────────────────────────────────────

function extractData(
  config: Record<string, unknown>,
  ctx: ExecutionContext,
): Record<string, unknown> {
  const path = (config.path as string | undefined) ?? "";
  const outputKey = (config.outputKey as string | undefined) ?? "extracted";

  if (!path) {
    throw new Error("extract_data: path is required");
  }

  const value = ctx.getPath(path);
  return { [outputKey]: value };
}

// ── Format Text ───────────────────────────────────────────────────

function formatText(
  config: Record<string, unknown>,
  ctx: ExecutionContext,
): Record<string, unknown> {
  const template = (config.template as string | undefined) ?? "";
  const outputKey = (config.outputKey as string | undefined) ?? "formatted";

  if (!template) {
    throw new Error("format_text: template is required");
  }

  const result = ctx.resolveTemplate(template);
  return { [outputKey]: result };
}

// ── Parse JSON ────────────────────────────────────────────────────

function parseJson(
  config: Record<string, unknown>,
  ctx: ExecutionContext,
): Record<string, unknown> {
  const inputKey = (config.inputKey as string | undefined) ?? "webhookResponse";
  const outputKey = (config.outputKey as string | undefined) ?? "parsed";

  const raw = ctx.get(inputKey);
  if (raw == null) {
    throw new Error(`parse_json: no value at key "${inputKey}"`);
  }

  if (typeof raw === "object") {
    // Already parsed
    return { [outputKey]: raw };
  }

  const parsed: unknown = JSON.parse(raw as string);
  return { [outputKey]: parsed };
}

// ── Registry ──────────────────────────────────────────────────────

const processors: Record<string, TransformProcessor> = {
  extract_data: extractData,
  format_text: formatText,
  parse_json: parseJson,
};

/**
 * Execute a transform node. Returns output data to merge into the execution context.
 * Throws on failure.
 */
export function executeTransform(
  subtype: string,
  config: Record<string, unknown>,
  ctx: ExecutionContext,
): Record<string, unknown> {
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
