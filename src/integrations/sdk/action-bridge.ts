/**
 * Action Bridge — adapts SDK actions into the workflow ActionExecutor pattern.
 *
 * The workflow engine dispatches actions by subtype string. SDK actions use
 * "integrationId.actionName" format (e.g. "slack.send_message"). This bridge
 * wraps the SDK execute() function to match the ActionExecutor signature and
 * return WorkflowItem[].
 */

import type { ExecutionContext } from "../../workflows/context.js";
import type { ActionDependencies, WorkflowItem } from "../../workflows/types.js";
import { createAuthContext } from "./auth-bridge.js";
import { getAction, getIntegration } from "./registry.js";
import type { IntegrationActionDef } from "./types.js";
import { validateInput } from "./validation.js";

type ActionExecutor = (
  config: Record<string, unknown>,
  ctx: ExecutionContext,
  deps: ActionDependencies,
) => Promise<WorkflowItem[]>;

// ── Rate limiter (fixed-window, per integration) ────────────────

const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(integrationId: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(integrationId);

  // New window or expired window — reset atomically
  if (!bucket || now - bucket.windowStart >= 60_000) {
    rateBuckets.set(integrationId, { count: 1, windowStart: now });
    return true;
  }

  // Within current window — check count
  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

// ── Recursive template resolution ───────────────────────────────

function resolveDeep(value: unknown, ctx: ExecutionContext): unknown {
  if (typeof value === "string") {
    return ctx.resolveTemplate(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveDeep(v, ctx));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveDeep(v, ctx);
    }
    return result;
  }
  return value;
}

/**
 * Create an ActionExecutor adapter for an SDK action.
 * Returns null if the integration or action is not registered.
 */
export function createSdkActionExecutor(
  integrationId: string,
  actionName: string,
): ActionExecutor | null {
  const def = getIntegration(integrationId);
  if (!def) {
    return null;
  }

  const action = getAction(integrationId, actionName);
  if (!action) {
    return null;
  }

  return async (
    config: Record<string, unknown>,
    ctx: ExecutionContext,
    deps: ActionDependencies,
  ): Promise<WorkflowItem[]> => {
    return executeSdkAction(integrationId, def.rateLimitPerMinute ?? 60, action, config, ctx, deps);
  };
}

async function executeSdkAction(
  integrationId: string,
  rateLimit: number,
  action: IntegrationActionDef,
  config: Record<string, unknown>,
  ctx: ExecutionContext,
  deps: ActionDependencies,
): Promise<WorkflowItem[]> {
  // Rate limit check
  if (!checkRateLimit(integrationId, rateLimit)) {
    throw new Error(`Rate limit exceeded for integration "${integrationId}" (${rateLimit}/min)`);
  }

  // Resolve template expressions recursively in all config values
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith("__")) {
      continue;
    } // Skip internal fields
    resolved[key] = resolveDeep(value, ctx);
  }

  // Validate resolved input against schema
  const validation = validateInput(resolved, action.inputSchema);
  if (!validation.valid) {
    throw new Error(`Invalid input for action "${action.name}": ${validation.errors.join(", ")}`);
  }

  // Create auth context with enriched error
  let auth;
  const credentialId = (config.__credentialId as string) ?? undefined;
  try {
    auth = await createAuthContext(integrationId, credentialId);
  } catch (err) {
    throw new Error(
      `Authentication failed for action "${action.name}" ` +
        `(integration: ${integrationId}, credential: ${credentialId ?? "default"}): ` +
        (err instanceof Error ? err.message : String(err)),
      { cause: err },
    );
  }

  // Execute the SDK action
  deps.log(`Executing SDK action: ${action.name}`);
  const result = await action.execute(resolved, auth);

  // Validate and wrap result as WorkflowItem[]
  if (result === null || result === undefined) {
    throw new Error(
      `Action "${action.name}" returned null/undefined — expected an object or array`,
    );
  }

  if (Array.isArray(result)) {
    return result.map((item) => {
      if (item === null || typeof item !== "object") {
        return { json: { value: item }, sourceNodeId: undefined };
      }
      return { json: item as Record<string, unknown>, sourceNodeId: undefined };
    });
  }

  if (typeof result !== "object") {
    return [{ json: { value: result }, sourceNodeId: undefined }];
  }

  return [{ json: result, sourceNodeId: undefined }];
}
