import { Check, ChevronDown, ChevronUp, Loader2, Plus, Route, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AI_PROVIDERS, type AiProvider } from "@/lib/ai-providers";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { MODELS_CATALOG } from "@/lib/models-catalog";
import { saveConfigPatch } from "@/lib/save-config";
import { cn } from "@/lib/utils";
import { notifyError } from "@/stores/notification-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IntentType = "search" | "reasoning" | "code" | "creative";

type RoutingRule = {
  intent: IntentType;
  provider: string;
  model: string;
};

type RoutingConfig = {
  enabled?: boolean;
  rules?: RoutingRule[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTENT_OPTIONS: IntentType[] = ["search", "reasoning", "code", "creative"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelRouting({ demoMode }: { demoMode: boolean }) {
  const { t } = useTranslation("models");
  const { t: tOnb } = useTranslation("onboarding");

  // --- State ---
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());

  // --- Load routing config ---
  useEffect(() => {
    if (demoMode) {
      setLoaded(true);
      return;
    }

    let cancelled = false;
    gatewayRpc<{ raw?: string }>("config.get", {})
      .then((res) => {
        if (cancelled) {
          return;
        }
        if (res.ok && res.payload?.raw) {
          const cfg = JSON.parse(res.payload.raw);
          const routing = cfg?.agents?.defaults?.routing as RoutingConfig | undefined;
          if (routing) {
            setEnabled(routing.enabled ?? false);
            setRules(Array.isArray(routing.rules) ? routing.rules : []);
          }
          // Track which providers are configured
          const providers = cfg?.models?.providers;
          if (providers && typeof providers === "object") {
            setConfiguredProviders(new Set(Object.keys(providers)));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [demoMode]);

  // --- Handlers ---

  function addRule() {
    // Find the first intent not yet used
    const usedIntents = new Set(rules.map((r) => r.intent));
    const nextIntent = INTENT_OPTIONS.find((i) => !usedIntents.has(i));
    if (!nextIntent) {
      return;
    } // All intents already have rules

    // Default to first configured provider, or first available
    const availableProviders = getAvailableProviders();
    const defaultProvider = availableProviders[0]?.id ?? "anthropic";
    const defaultModel = getModelsForProvider(defaultProvider)[0]?.id ?? "";

    setRules([...rules, { intent: nextIntent, provider: defaultProvider, model: defaultModel }]);
    setSavedHint(false);
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index));
    setSavedHint(false);
  }

  function updateRule(index: number, field: keyof RoutingRule, value: string) {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };

    // When provider changes, reset model to first available
    if (field === "provider") {
      const models = getModelsForProvider(value);
      updated[index].model = models[0]?.id ?? "";
    }

    setRules(updated);
    setSavedHint(false);
  }

  async function handleSave() {
    setSaving(true);
    setSavedHint(false);
    try {
      const patch = {
        agents: {
          defaults: {
            routing: {
              enabled,
              rules: rules.length > 0 ? rules : [],
            },
          },
        },
      };
      const res = await saveConfigPatch(patch);
      if (res.ok) {
        setSavedHint(true);
      } else {
        notifyError(
          t("configConflict", "Configuration changed externally."),
          new Error(res.error ?? "Save failed"),
        );
      }
    } catch (err) {
      notifyError("Failed to save routing", err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }

  // --- Helpers ---

  function getAvailableProviders(): AiProvider[] {
    return AI_PROVIDERS.filter((p) => configuredProviders.has(p.id));
  }

  function getModelsForProvider(providerId: string): Array<{ id: string; name: string }> {
    const catalog = MODELS_CATALOG[providerId];
    if (catalog) {
      return catalog.models.filter((m) => !m.deprecated).map((m) => ({ id: m.id, name: m.name }));
    }
    return [];
  }

  function getIntentLabel(intent: IntentType): string {
    return t(`routing.intent.${intent}`, intent);
  }

  function getIntentDesc(intent: IntentType): string {
    const map: Record<IntentType, string> = {
      search: t("routing.searchDesc", "Current events, lookups, real-time data"),
      reasoning: t("routing.reasoningDesc", "Math, logic, analysis, multi-step problems"),
      code: t("routing.codeDesc", "Programming, debugging, code generation"),
      creative: t("routing.creativeDesc", "Stories, poems, creative writing"),
    };
    return map[intent];
  }

  const availableProviders = getAvailableProviders();
  const usedIntents = new Set(rules.map((r) => r.intent));
  const canAddRule = INTENT_OPTIONS.some((i) => !usedIntents.has(i));

  if (!loaded) {
    return null;
  }

  return (
    <div className="rounded-2xl glass-panel overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-[var(--glass-subtle-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-900/30 flex items-center justify-center">
            <Route className="w-4.5 h-4.5 text-purple-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-neutral-100">
              {t("routing.title", "Model Routing")}
            </h3>
            <p className="text-[11px] text-neutral-500">
              {t(
                "routing.subtitle",
                "Automatically route messages to different AI providers based on detected intent",
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {enabled && rules.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-400 border border-purple-800/50">
              {rules.length} {rules.length === 1 ? "rule" : "rules"}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-neutral-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--glass-border)]">
          {/* Enable toggle */}
          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="text-sm text-neutral-200">
                {t("routing.enabled", "Enable intent-based routing")}
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {t(
                  "routing.enabledDesc",
                  "When enabled, messages are analyzed and routed to the best provider for each task",
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => {
                setEnabled(!enabled);
                setSavedHint(false);
              }}
              disabled={demoMode}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                enabled ? "bg-purple-600" : "bg-neutral-700",
                demoMode && "opacity-50 cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>

          {/* No configured providers warning */}
          {availableProviders.length < 2 && (
            <div className="rounded-xl bg-amber-900/20 border border-amber-800/30 px-3 py-2 text-[11px] text-amber-400">
              Configure at least 2 AI providers above to use routing. Routing switches between
              providers based on message intent.
            </div>
          )}

          {/* Rules */}
          {enabled && (
            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="text-center py-6">
                  <Route className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">
                    {t("routing.noRules", "No routing rules configured")}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {t(
                      "routing.noRulesDesc",
                      "Add rules to route different types of messages to specialized providers",
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule, idx) => (
                    <div
                      key={`${rule.intent}-${idx}`}
                      className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3"
                    >
                      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        {/* Intent selector */}
                        <div>
                          <label className="text-[10px] text-neutral-500 block mb-1">
                            {t("routing.intent", "Intent")}
                          </label>
                          <select
                            value={rule.intent}
                            onChange={(e) => updateRule(idx, "intent", e.target.value)}
                            disabled={demoMode}
                            className="w-full h-8 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-2 text-xs text-neutral-200 focus:border-purple-500 focus:outline-none"
                          >
                            {INTENT_OPTIONS.map((intent) => (
                              <option
                                key={intent}
                                value={intent}
                                disabled={usedIntents.has(intent) && intent !== rule.intent}
                              >
                                {getIntentLabel(intent)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Provider selector */}
                        <div>
                          <label className="text-[10px] text-neutral-500 block mb-1">
                            {t("routing.provider", "Provider")}
                          </label>
                          <select
                            value={rule.provider}
                            onChange={(e) => updateRule(idx, "provider", e.target.value)}
                            disabled={demoMode}
                            className="w-full h-8 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-2 text-xs text-neutral-200 focus:border-purple-500 focus:outline-none"
                          >
                            {AI_PROVIDERS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {tOnb(`ai.${p.key}`, p.id)}
                                {configuredProviders.has(p.id) ? "" : " (not configured)"}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Model selector */}
                        <div>
                          <label className="text-[10px] text-neutral-500 block mb-1">
                            {t("routing.model", "Model")}
                          </label>
                          <select
                            value={rule.model}
                            onChange={(e) => updateRule(idx, "model", e.target.value)}
                            disabled={demoMode}
                            className="w-full h-8 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-2 text-xs text-neutral-200 focus:border-purple-500 focus:outline-none"
                          >
                            {getModelsForProvider(rule.provider).length > 0 ? (
                              getModelsForProvider(rule.provider).map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))
                            ) : (
                              <option value={rule.model}>{rule.model || "Enter model ID"}</option>
                            )}
                          </select>
                          {getModelsForProvider(rule.provider).length === 0 && (
                            <input
                              type="text"
                              value={rule.model}
                              onChange={(e) => updateRule(idx, "model", e.target.value)}
                              placeholder="model-id"
                              disabled={demoMode}
                              className="w-full h-7 mt-1 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-2 text-[11px] text-neutral-200 font-mono focus:border-purple-500 focus:outline-none"
                            />
                          )}
                        </div>

                        {/* Delete */}
                        <div className="pt-4">
                          <button
                            type="button"
                            onClick={() => removeRule(idx)}
                            disabled={demoMode}
                            aria-label={`Remove rule for ${getIntentLabel(rule.intent)}`}
                            className="p-1.5 rounded-md hover:bg-red-900/30 text-neutral-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-neutral-500 mt-1.5">
                        {getIntentDesc(rule.intent)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add + Save buttons */}
              <div className="flex items-center gap-2 pt-1">
                {canAddRule && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={addRule}
                    disabled={demoMode}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {t("routing.addRule", "Add Rule")}
                  </Button>
                )}
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={handleSave}
                  disabled={saving || demoMode}
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : savedHint ? (
                    <Check className="w-3 h-3 mr-1" />
                  ) : (
                    <Route className="w-3 h-3 mr-1" />
                  )}
                  {t("routing.save", "Save Routing Rules")}
                </Button>
              </div>
            </div>
          )}

          {/* Save for enabled/disabled toggle change */}
          {!enabled && (
            <div className="pt-1">
              <Button
                size="sm"
                className="text-xs"
                onClick={handleSave}
                disabled={saving || demoMode}
              >
                {saving ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : savedHint ? (
                  <Check className="w-3 h-3 mr-1" />
                ) : (
                  <Route className="w-3 h-3 mr-1" />
                )}
                {t("routing.save", "Save Routing Rules")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
