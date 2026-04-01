/**
 * Integration SDK registry.
 *
 * Module-level singleton that stores registered integrations.
 * Providers call registerIntegration() at import time.
 */

import type {
  IntegrationActionDef,
  IntegrationDefinition,
  IntegrationTriggerDef,
} from "./types.js";
import { validateIntegrationDefinition } from "./validation.js";

// ── Module-level registry ───────────────────────────────────────

const registry = new Map<string, IntegrationDefinition>();

/**
 * Register an integration definition. Called at module scope by providers.
 * Throws if the definition is invalid or the ID is already registered.
 */
export function registerIntegration(def: IntegrationDefinition): void {
  const errors = validateIntegrationDefinition(def);
  if (errors.length > 0) {
    throw new Error(
      `Invalid integration definition "${def.id ?? "(no id)"}":\n  - ${errors.join("\n  - ")}`,
    );
  }
  if (registry.has(def.id)) {
    throw new Error(`Integration "${def.id}" is already registered`);
  }
  registry.set(def.id, def);
}

/**
 * Get an integration by ID.
 */
export function getIntegration(id: string): IntegrationDefinition | undefined {
  return registry.get(id);
}

/**
 * List all registered integrations.
 */
export function listIntegrations(): IntegrationDefinition[] {
  return [...registry.values()];
}

/**
 * Look up a specific action by integration ID and action name.
 */
export function getAction(
  integrationId: string,
  actionName: string,
): IntegrationActionDef | undefined {
  const def = registry.get(integrationId);
  if (!def) {
    return undefined;
  }
  return def.actions.find((a) => a.name === actionName);
}

/**
 * Look up a specific trigger by integration ID and trigger name.
 */
export function getTrigger(
  integrationId: string,
  triggerName: string,
): IntegrationTriggerDef | undefined {
  const def = registry.get(integrationId);
  if (!def) {
    return undefined;
  }
  return def.triggers.find((t) => t.name === triggerName);
}

/**
 * Clear all registered integrations. For testing only.
 */
export function clearRegistry(): void {
  registry.clear();
}
