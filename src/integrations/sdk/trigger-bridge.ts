/**
 * Trigger Bridge — adapts SDK triggers into the TriggerManager pattern.
 *
 * Handles both polling triggers (setInterval) and webhook triggers.
 * Webhook triggers return registration metadata that the TriggerManager
 * uses to populate its webhooks map directly.
 */

import type { Workflow, WorkflowNode } from "../../workflows/types.js";
import { createAuthContext } from "./auth-bridge.js";
import type { IntegrationTriggerDef } from "./types.js";

type TriggerCallback = (
  workflow: Workflow,
  triggerNode: WorkflowNode,
  triggerData: Record<string, unknown>,
) => void;

type RegisteredTrigger = {
  workflowId: string;
  nodeId: string;
  type: string;
  cleanup: () => void;
};

/** Optional error logger for poll failures. */
type ErrorLogger = (message: string) => void;

/**
 * Extended trigger result for webhook triggers — includes metadata
 * for the TriggerManager to register the webhook in its map.
 */
export type SdkTriggerResult = RegisteredTrigger & {
  /** For webhook triggers: the webhook parse function. */
  webhookParse?: (
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) => Record<string, unknown>[];
  /** For webhook triggers: the webhook path. */
  webhookPath?: string;
  /** For webhook triggers: the webhook secret. */
  webhookSecret?: string;
};

// ── Polling state ───────────────────────────────────────────────

const pollStates = new Map<string, unknown>();

/**
 * Register an SDK trigger and return a SdkTriggerResult with cleanup.
 * For webhook triggers, the result includes parse function + path/secret
 * so the TriggerManager can wire it into its webhooks map.
 */
export function registerSdkTrigger(
  workflow: Workflow,
  node: WorkflowNode,
  triggerDef: IntegrationTriggerDef,
  onTrigger: TriggerCallback,
  errorLog?: ErrorLogger,
): SdkTriggerResult | null {
  if (triggerDef.type === "polling") {
    return registerPollingTrigger(workflow, node, triggerDef, onTrigger, errorLog);
  }
  if (triggerDef.type === "webhook") {
    return registerWebhookTrigger(workflow, node, triggerDef);
  }
  return null;
}

// ── Polling trigger ──────────────────────────────────────────────

function registerPollingTrigger(
  workflow: Workflow,
  node: WorkflowNode,
  triggerDef: IntegrationTriggerDef,
  onTrigger: TriggerCallback,
  errorLog?: ErrorLogger,
): SdkTriggerResult {
  const stateKey = `${workflow.id}:${node.id}`;
  const intervalMs = triggerDef.pollIntervalMs ?? 60_000;

  const poll = async () => {
    if (!triggerDef.poll) {
      return;
    }
    try {
      const integrationId = triggerDef.name.split(".")[0];
      const credentialId = (node.config.__credentialId as string) ?? undefined;
      const auth = await createAuthContext(integrationId, credentialId);
      const lastState = pollStates.get(stateKey);

      const { items, newState } = await triggerDef.poll(node.config, auth, lastState);
      pollStates.set(stateKey, newState);

      if (items.length > 0) {
        for (const item of items) {
          onTrigger(workflow, node, {
            triggerType: triggerDef.name,
            ...item,
            receivedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      const msg = `[${triggerDef.name}] Poll error for workflow "${workflow.name}" (${workflow.id}): ${err instanceof Error ? err.message : String(err)}`;
      if (errorLog) {
        errorLog(msg);
      } else {
        // Fallback: log to console so errors are never fully silent
        console.error(msg);
      }
    }
  };

  // Initial poll after a short delay, then on interval
  const initialTimeout = setTimeout(poll, 5_000);
  const interval = setInterval(poll, intervalMs);

  return {
    workflowId: workflow.id,
    nodeId: node.id,
    type: triggerDef.name,
    cleanup: () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      pollStates.delete(stateKey);
    },
  };
}

// ── Webhook trigger ──────────────────────────────────────────────

function registerWebhookTrigger(
  workflow: Workflow,
  node: WorkflowNode,
  triggerDef: IntegrationTriggerDef,
): SdkTriggerResult | null {
  const path = (node.config.path as string) ?? (node.config.webhookPath as string);
  if (!path || !node.config.secret) {
    return null;
  }

  const normalizedPath = path.replace(/^\/+/, "");

  return {
    workflowId: workflow.id,
    nodeId: node.id,
    type: triggerDef.name,
    cleanup: () => {
      // Webhook cleanup is handled by TriggerManager.unregisterWorkflow()
    },
    // Metadata for TriggerManager to register the webhook properly
    webhookPath: normalizedPath,
    webhookSecret: node.config.secret as string,
    webhookParse: triggerDef.webhookParse,
  };
}
