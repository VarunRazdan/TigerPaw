/**
 * Intent-based model routing.
 * Maps a classified intent to a provider/model pair from the user's routing config.
 * Falls back gracefully when routing is disabled, no rule matches, or the target
 * provider is not configured.
 */

import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { ClassificationResult, IntentCategory } from "./intent-classifier.js";
import {
  type ModelRef,
  findNormalizedProviderValue,
  normalizeModelRef,
} from "./model-selection.js";

const log = createSubsystemLogger("model-routing");

export type RoutingRule = {
  intent: IntentCategory;
  provider: string;
  model: string;
};

export type RoutingConfig = {
  enabled?: boolean;
  rules?: RoutingRule[];
};

export type RoutingResolution =
  | { routed: true; ref: ModelRef; intent: IntentCategory; rule: RoutingRule }
  | {
      routed: false;
      reason: "disabled" | "no-rule" | "general-intent" | "provider-unavailable";
      intent: IntentCategory;
    };

export function resolveIntentRoute(params: {
  intent: IntentCategory;
  cfg: OpenClawConfig;
  routingConfig: RoutingConfig | undefined;
}): RoutingResolution {
  const { intent, cfg, routingConfig } = params;

  if (!routingConfig?.enabled) {
    return { routed: false, reason: "disabled", intent };
  }

  if (intent === "general") {
    return { routed: false, reason: "general-intent", intent };
  }

  const rules = routingConfig.rules;
  if (!rules || rules.length === 0) {
    return { routed: false, reason: "no-rule", intent };
  }

  const rule = rules.find((r) => r.intent === intent);
  if (!rule) {
    return { routed: false, reason: "no-rule", intent };
  }

  // Check that the target provider is configured (has an entry in models.providers).
  // We do NOT check auth here — auth errors surface naturally through the existing
  // error path, and the fallback chain handles provider failures.
  const providerEntry = findNormalizedProviderValue(cfg.models?.providers, rule.provider);
  if (!providerEntry) {
    log.warn(
      `routing: skipped ${intent} route to ${rule.provider}/${rule.model} (provider not configured)`,
    );
    return { routed: false, reason: "provider-unavailable", intent };
  }

  const ref = normalizeModelRef(rule.provider, rule.model);
  log.info(`routing: ${intent} -> ${ref.provider}/${ref.model}`);
  return { routed: true, ref, intent, rule };
}

/**
 * Per-message routing telemetry record.
 * Captures both the classifier output and the router's resolution so the UI can
 * explain why a route did or did not fire.
 */
export type RoutingDecision = {
  ts: number;
  sessionKey?: string;
  channel?: string;
  bodyPreview: string;
  intent: IntentCategory;
  confidence: "high" | "medium";
  matchedPattern?: string;
  defaultProvider: string;
  defaultModel: string;
  routed: boolean;
  routedProvider?: string;
  routedModel?: string;
  reason?: "disabled" | "no-rule" | "general-intent" | "provider-unavailable";
};

export function buildRoutingDecision(params: {
  classification: ClassificationResult;
  resolution: RoutingResolution;
  defaultProvider: string;
  defaultModel: string;
  ctx: { sessionKey?: string; channel?: string; bodyPreview: string };
}): RoutingDecision {
  const { classification, resolution, defaultProvider, defaultModel, ctx } = params;
  const base: RoutingDecision = {
    ts: Date.now(),
    sessionKey: ctx.sessionKey,
    channel: ctx.channel,
    bodyPreview: ctx.bodyPreview,
    intent: classification.intent,
    confidence: classification.confidence,
    matchedPattern: classification.matchedPattern,
    defaultProvider,
    defaultModel,
    routed: false,
  };
  if (resolution.routed) {
    return {
      ...base,
      routed: true,
      routedProvider: resolution.ref.provider,
      routedModel: resolution.ref.model,
    };
  }
  return { ...base, reason: resolution.reason };
}
