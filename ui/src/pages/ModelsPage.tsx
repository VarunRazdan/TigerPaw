import { Check, Loader2, RefreshCw, Sparkles, Star, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataModeSelector } from "@/components/DataModeSelector";
import { Button } from "@/components/ui/button";
import {
  AI_PROVIDERS,
  AI_PROVIDER_MAP,
  buildAiConfigPatch,
  getProviderStatus,
  type AiProvider,
} from "@/lib/ai-providers";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { MODELS_CATALOG, formatPrice, formatTokens, type CatalogModel } from "@/lib/models-catalog";
import { saveConfigPatch } from "@/lib/save-config";
import { cn } from "@/lib/utils";
import { notifyError } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_CONFIGURED = new Set(["anthropic"]);
const DEMO_PREFERRED = "anthropic";
const DEMO_MODEL = { provider: "anthropic", id: "claude-sonnet-4-6" };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status: "preferred" | "configured" | "detected" | "available";
}) {
  const { t } = useTranslation("models");
  if (status === "available") {
    return null;
  }

  const styles = {
    preferred: "bg-orange-900/50 text-orange-400 border-orange-800/50",
    configured: "bg-green-900/50 text-green-400 border-green-800/50",
    detected: "bg-blue-900/50 text-blue-400 border-blue-800/50",
  };

  const labels = {
    preferred: t("preferred", "Preferred"),
    configured: t("configured", "Configured"),
    detected: t("detected", "Detected"),
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium",
        styles[status],
      )}
      aria-label={labels[status]}
    >
      {status === "preferred" && <Star className="w-2.5 h-2.5 fill-current" />}
      {labels[status]}
    </span>
  );
}

function ProviderCard({
  provider,
  status,
  selected,
  onClick,
}: {
  provider: AiProvider;
  status: "preferred" | "configured" | "detected" | "available";
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "rounded-xl glass-panel-interactive p-3 flex flex-col gap-2 text-left cursor-pointer",
        "hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 transition-all duration-300",
        selected && "border-orange-600/60 shadow-lg shadow-orange-900/20",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-100">
          {t(`ai.${provider.key}`, provider.id)}
        </span>
        <StatusBadge status={status} />
      </div>
      <p className="text-[11px] text-neutral-500 leading-snug">{provider.pricing}</p>
      <p className="text-[11px] text-neutral-400">{provider.models}</p>
    </button>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 pr-16 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none transition-colors"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 hover:text-neutral-300 px-1.5 py-0.5 rounded transition-colors"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function ModelTable({
  models,
  selectedModel,
  currentModelId,
  onSelect,
  live,
}: {
  models: CatalogModel[];
  selectedModel: string | null;
  currentModelId?: string | null;
  onSelect: (id: string) => void;
  live?: boolean;
}) {
  const { t } = useTranslation("models");

  if (models.length === 0) {
    return (
      <p className="text-xs text-neutral-500 py-2">
        {t("noModelsAvailable", "No models available")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-500 border-b border-[var(--glass-border)]">
            <th className="text-left py-1.5 pr-3 font-medium">Model</th>
            <th className="text-right py-1.5 px-2 font-medium">Context</th>
            <th className="text-right py-1.5 px-2 font-medium">Input</th>
            <th className="text-right py-1.5 px-2 font-medium">Output</th>
            <th className="py-1.5 pl-2 w-8" />
          </tr>
        </thead>
        <tbody role="radiogroup" aria-label="Model selection">
          {models.map((m) => (
            <tr
              key={m.id}
              role="radio"
              aria-checked={selectedModel === m.id}
              tabIndex={0}
              onClick={() => onSelect(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(m.id);
                }
              }}
              className={cn(
                "border-b border-[var(--glass-border)] cursor-pointer transition-colors",
                "hover:bg-[var(--glass-subtle-hover)]",
                selectedModel === m.id && "bg-orange-900/20",
              )}
            >
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-neutral-200 font-medium">{m.name}</span>
                  {m.reasoning && (
                    <span title="Reasoning">
                      <Zap className="w-3 h-3 text-amber-400" />
                    </span>
                  )}
                  {m.deprecated && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 font-medium">
                      deprecated
                    </span>
                  )}
                  {live && <span className="text-[9px] text-green-500 font-medium">live</span>}
                  {m.id === currentModelId && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-900/40 text-orange-400 font-medium">
                      current
                    </span>
                  )}
                </div>
                <span className="text-neutral-500 font-mono text-[10px]">{m.id}</span>
              </td>
              <td className="text-right py-1.5 px-2 text-neutral-400 font-mono">
                {formatTokens(m.contextWindow)}
              </td>
              <td className="text-right py-1.5 px-2 text-neutral-400 font-mono">
                {formatPrice(m.pricing.input)}
              </td>
              <td className="text-right py-1.5 px-2 text-neutral-400 font-mono">
                {formatPrice(m.pricing.output)}
              </td>
              <td className="py-1.5 pl-2">
                <span
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center",
                    selectedModel === m.id ? "border-orange-400" : "border-neutral-600",
                  )}
                >
                  {selectedModel === m.id && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-neutral-600 mt-1.5">
        {t("pricingNote", "Prices per 1M tokens")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ModelsPage() {
  const { t } = useTranslation("models");
  const { t: tOnb } = useTranslation("onboarding");
  const demoMode = useTradingStore((s) => s.demoMode);

  // --- State ---
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [detectedProviders, setDetectedProviders] = useState<Set<string>>(new Set());
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(
    () => new Set(demoMode ? DEMO_CONFIGURED : []),
  );
  const [preferredProvider, setPreferredProvider] = useState<string | null>(
    demoMode ? DEMO_PREFERRED : null,
  );
  const [currentModel, setCurrentModel] = useState<{ provider: string; id: string } | null>(
    demoMode ? DEMO_MODEL : null,
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [liveModels, setLiveModels] = useState<Record<string, CatalogModel[]>>({});
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelSavedHint, setModelSavedHint] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!demoMode);
  const abortRef = useRef<AbortController | null>(null);

  // --- Load config on mount ---
  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    async function load() {
      try {
        const res = await gatewayRpc<{ raw?: string; hash?: string }>("config.get", {});
        if (ac.signal.aborted) {
          return;
        }
        if (res.ok && res.payload?.raw) {
          const cfg = JSON.parse(res.payload.raw);
          const providers = cfg?.models?.providers;
          const providerIds =
            providers && typeof providers === "object" ? Object.keys(providers) : [];
          if (providerIds.length > 0) {
            setConfiguredProviders(new Set(providerIds));
            setIsLive(true);
          }

          // Read preferred provider from agents.defaults.model
          const defaultModel = cfg?.agents?.defaults?.model;
          let prov: string | null = null;
          let modelId: string | null = null;
          if (defaultModel) {
            // Format: { primary: "provider/model-id", fallbacks: [] }
            let modelStr: string | null = null;
            if (typeof defaultModel === "string") {
              modelStr = defaultModel;
            } else if (typeof defaultModel === "object") {
              const obj = defaultModel as Record<string, unknown>;
              modelStr = typeof obj.primary === "string" ? obj.primary : null;
            }
            if (modelStr && modelStr.includes("/")) {
              const parts = modelStr.split("/");
              prov = parts[0];
              modelId = parts.slice(1).join("/");
            }
          }

          // If no explicit default but providers are configured, use the first one
          if (!prov && providerIds.length > 0) {
            prov = providerIds[0];
          }

          if (prov) {
            setPreferredProvider(prov);
            if (modelId) {
              setCurrentModel({ provider: prov, id: modelId });
            } else {
              // Pick the first model from the catalog as display default
              const catalogModels = MODELS_CATALOG[prov]?.models;
              if (catalogModels?.[0]) {
                setCurrentModel({ provider: prov, id: catalogModels[0].id });
              }
            }
          }
        }
      } catch {
        // Gateway offline — stay in demo/empty state
      } finally {
        if (!ac.signal.aborted) {
          setInitialLoading(false);
        }
      }
    }

    void load();
    return () => ac.abort();
  }, []);

  // --- Auto-detect local providers ---
  useEffect(() => {
    if (demoMode) {
      return;
    }
    const ac = new AbortController();

    for (const p of AI_PROVIDERS) {
      if (!p.detectPort) {
        continue;
      }
      const id = p.id;
      gatewayRpc<{ ok: boolean }>("onboarding.test", {
        provider: id,
        credentials: { baseUrl: `http://localhost:${p.detectPort}` },
      })
        .then((res) => {
          if (ac.signal.aborted) {
            return;
          }
          if (res.ok && res.payload?.ok) {
            setDetectedProviders((prev) => new Set([...prev, id]));
          }
        })
        .catch(() => {});
    }

    return () => ac.abort();
  }, [demoMode]);

  // --- React to demo toggle ---
  useEffect(() => {
    if (!isLive) {
      if (demoMode) {
        setConfiguredProviders(new Set(DEMO_CONFIGURED));
        setPreferredProvider(DEMO_PREFERRED);
        setCurrentModel(DEMO_MODEL);
      } else {
        setConfiguredProviders(new Set());
        setPreferredProvider(null);
        setCurrentModel(null);
      }
    }
  }, [demoMode, isLive]);

  // --- Handlers ---

  function handleSelectProvider(id: string) {
    if (selectedProvider === id) {
      setSelectedProvider(null);
      return;
    }
    setSelectedProvider(id);
    setCredentials({});
    setTestStatus("idle");
    setTestError(null);
    setModelSavedHint(false);
    if (currentModel?.provider === id) {
      setSelectedModel(currentModel.id);
    } else {
      const { models: available } = getModelsForProvider(id);
      setSelectedModel(available[0]?.id ?? null);
    }
  }

  async function handleTest() {
    if (!selectedProvider) {
      return;
    }
    setTestStatus("testing");
    setTestError(null);

    try {
      const provider = AI_PROVIDER_MAP[selectedProvider];
      const creds = { ...credentials };
      if (provider?.local && !creds.baseUrl) {
        creds.baseUrl = `http://localhost:${provider.detectPort ?? 11434}`;
      }

      const res = await gatewayRpc<{ ok: boolean; detail?: string; error?: string }>(
        "onboarding.test",
        { provider: selectedProvider, credentials: creds },
      );

      if (res.ok && res.payload?.ok) {
        setTestStatus("success");

        // Auto-save on success
        const patch = buildAiConfigPatch(selectedProvider, creds);
        const saveRes = await saveConfigPatch(patch);
        if (saveRes.ok) {
          setConfiguredProviders((prev) => new Set([...prev, selectedProvider]));
          setIsLive(true);
        }
      } else {
        setTestStatus("error");
        const errMsg = res.ok ? res.payload?.error : res.error;
        setTestError(errMsg ?? t("testFailed", "Connection failed"));
      }
    } catch {
      setTestStatus("error");
      setTestError(t("testTimeout", "Connection timed out"));
    }
  }

  async function handleSetPreferred() {
    if (!selectedProvider || !selectedModel) {
      return;
    }
    setSaving(true);
    try {
      const patch = {
        agents: {
          defaults: { model: { primary: `${selectedProvider}/${selectedModel}`, fallbacks: [] } },
        },
      };
      const res = await saveConfigPatch(patch);
      if (res.ok) {
        setPreferredProvider(selectedProvider);
        setCurrentModel({ provider: selectedProvider, id: selectedModel });
        setModelSavedHint(true);
        // No restart needed — agents.defaults.model is hot-reloadable via config file watcher
      } else {
        notifyError(
          t("configConflict", "Configuration changed externally."),
          new Error(res.error ?? "Save failed"),
        );
      }
    } catch (err) {
      notifyError("Failed to save model", err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshModels() {
    if (!selectedProvider) {
      return;
    }
    setRefreshingModels(true);
    try {
      const creds = { ...credentials };
      const provider = AI_PROVIDER_MAP[selectedProvider];
      if (provider?.local && !creds.baseUrl) {
        creds.baseUrl = `http://localhost:${provider.detectPort ?? 11434}`;
      }
      const res = await gatewayRpc<{ ok: boolean; models?: Array<{ id: string; name: string }> }>(
        "onboarding.models",
        { provider: selectedProvider, credentials: creds },
      );
      if (res.ok && Array.isArray(res.payload?.models)) {
        const models = res.payload.models;
        const catalogModels: CatalogModel[] = models.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          contextWindow: 0,
          maxOutput: 0,
          pricing: { input: 0, output: 0 },
        }));
        setLiveModels((prev) => ({ ...prev, [selectedProvider]: catalogModels }));
      }
    } catch {
      notifyError(t("testFailed", "Connection failed"), null);
    }
    setRefreshingModels(false);
  }

  // --- Derived ---

  const activeProviderDef = preferredProvider ? AI_PROVIDER_MAP[preferredProvider] : null;
  const activeModelDef = currentModel
    ? MODELS_CATALOG[currentModel.provider]?.models.find((m) => m.id === currentModel.id)
    : null;

  function getModelsForProvider(id: string): { models: CatalogModel[]; live: boolean } {
    if (liveModels[id]) {
      return { models: liveModels[id], live: true };
    }
    if (MODELS_CATALOG[id]) {
      return { models: MODELS_CATALOG[id].models, live: false };
    }
    return { models: [], live: false };
  }

  const currentModelIdForProvider =
    currentModel?.provider === selectedProvider ? currentModel.id : null;

  const canTest = (() => {
    if (!selectedProvider || demoMode) {
      return false;
    }
    const provider = AI_PROVIDER_MAP[selectedProvider];
    if (!provider) {
      return false;
    }
    if (provider.local) {
      return true;
    }
    return provider.fields.every((f) => f.type !== "password" || credentials[f.name]?.trim());
  })();

  // --- Render ---

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-400" />
            {t("title", "AI Provider")}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {t("subtitle", "Configure your AI provider, API credentials, and preferred model")}
          </p>
        </div>
        <DataModeSelector />
      </div>

      {/* Active Provider Card */}
      {preferredProvider && (
        <div className="rounded-2xl glass-panel p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-900/30 flex items-center justify-center">
                <Star className="w-5 h-5 text-orange-400 fill-orange-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">
                  {t("activeProvider", "Active Provider")}:{" "}
                  {activeProviderDef
                    ? tOnb(`ai.${activeProviderDef.key}`, activeProviderDef.id)
                    : preferredProvider}
                </h2>
                <p className="text-xs text-neutral-400">
                  {t("activeModel", "Active Model")}:{" "}
                  <span className="text-neutral-200 font-mono">
                    {activeModelDef?.name ?? currentModel?.id ?? "—"}
                  </span>
                  {activeModelDef && (
                    <span className="text-neutral-500 ml-2">
                      {formatTokens(activeModelDef.contextWindow)} context
                    </span>
                  )}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border bg-green-900/50 text-green-400 border-green-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {t("configured", "Configured")}
            </span>
          </div>
        </div>
      )}

      {/* No provider configured */}
      {!preferredProvider && !demoMode && (
        <div className="rounded-2xl glass-panel p-6 text-center">
          <Sparkles className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
          <h2 className="text-sm font-semibold text-neutral-300">
            {t("noProviderConfigured", "No AI provider configured yet")}
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            {t("noProviderDesc", "Select a provider below to get started")}
          </p>
        </div>
      )}

      {/* Demo mode banner */}
      {demoMode && (
        <div className="rounded-xl bg-amber-900/20 border border-amber-800/30 px-4 py-2.5 text-xs text-amber-400">
          {t("demoModeNote", "Switch to Live mode to configure providers")}
        </div>
      )}

      {/* Provider Grid */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">
          {t("allProviders", "All Providers")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" role="radiogroup">
          {AI_PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              status={getProviderStatus(
                p.id,
                configuredProviders,
                detectedProviders,
                preferredProvider,
              )}
              selected={selectedProvider === p.id}
              onClick={() => handleSelectProvider(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Expanded Config Panel */}
      {selectedProvider &&
        (() => {
          const provider = AI_PROVIDER_MAP[selectedProvider];
          if (!provider) {
            return null;
          }
          const providerStatus = getProviderStatus(
            selectedProvider,
            configuredProviders,
            detectedProviders,
            preferredProvider,
          );
          const { models: displayModels, live: isLiveModels } =
            getModelsForProvider(selectedProvider);

          return (
            <div className="rounded-2xl glass-panel p-5 space-y-5">
              {/* Panel header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-neutral-100">
                    {tOnb(`ai.${provider.key}`, provider.id)}
                  </h3>
                  <StatusBadge status={providerStatus} />
                  {providerStatus === "configured" && configuredProviders.has(selectedProvider) && (
                    <span className="text-[10px] text-neutral-500">
                      {t("previouslyConfigured", "Previously configured")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProvider(null)}
                  className="p-1 rounded-md hover:bg-[var(--glass-subtle-hover)] transition-colors"
                >
                  <X className="w-4 h-4 text-neutral-500" />
                </button>
              </div>

              {/* Security note */}
              <p className="text-[11px] text-neutral-500">
                {tOnb(
                  "ai.securityNote",
                  "Your API key is stored locally and never sent to any third party.",
                )}
              </p>

              {/* Credential fields */}
              {provider.fields.length > 0 && (
                <div className="space-y-3">
                  {provider.fields.map((field) => (
                    <div key={field.name}>
                      <label
                        htmlFor={`cred-${field.name}`}
                        className="text-[11px] text-neutral-400 block mb-1"
                      >
                        {tOnb(field.i18nKey, field.name)}
                      </label>
                      {field.type === "password" ? (
                        <PasswordInput
                          id={`cred-${field.name}`}
                          value={credentials[field.name] ?? ""}
                          onChange={(v) => setCredentials((prev) => ({ ...prev, [field.name]: v }))}
                          placeholder={tOnb(field.i18nKey, field.name)}
                        />
                      ) : (
                        <input
                          id={`cred-${field.name}`}
                          type="text"
                          value={credentials[field.name] ?? ""}
                          onChange={(e) =>
                            setCredentials((prev) => ({ ...prev, [field.name]: e.target.value }))
                          }
                          placeholder={tOnb(field.i18nKey, field.name)}
                          className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 font-mono focus:border-orange-500 focus:outline-none transition-colors"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={handleTest}
                  disabled={!canTest || testStatus === "testing"}
                >
                  {testStatus === "testing" ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      {t("testing", "Testing connection...")}
                    </>
                  ) : (
                    t("testConnection", "Test Connection")
                  )}
                </Button>

                {testStatus === "success" && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="w-3.5 h-3.5" />
                    {t("testSuccess", "Connection successful")}
                  </span>
                )}
                {testStatus === "error" && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <X className="w-3.5 h-3.5" />
                    {testError ?? t("testFailed", "Connection failed")}
                  </span>
                )}
              </div>

              {/* Model selection */}
              {(configuredProviders.has(selectedProvider) || testStatus === "success") && (
                <div className="space-y-3 pt-2 border-t border-[var(--glass-border)]">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-neutral-200">
                      {t("defaultModel", "Default Model")}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-neutral-400"
                      onClick={handleRefreshModels}
                      disabled={refreshingModels}
                    >
                      {refreshingModels ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3 mr-1" />
                      )}
                      {t("refreshModels", "Refresh from API")}
                    </Button>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    {t(
                      "defaultModelDesc",
                      "The model used for Jarvis, workflows, and all AI features",
                    )}
                  </p>
                  <ModelTable
                    models={displayModels}
                    selectedModel={selectedModel}
                    currentModelId={currentModelIdForProvider}
                    onSelect={setSelectedModel}
                    live={isLiveModels}
                  />

                  {/* Save model — always visible, disabled when unchanged */}
                  {selectedModel && (
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={handleSetPreferred}
                      disabled={saving || demoMode || selectedModel === currentModelIdForProvider}
                    >
                      {saving ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <Star className="w-3 h-3 mr-1.5" />
                      )}
                      {preferredProvider === selectedProvider
                        ? t("saveModel", "Save & Reload")
                        : t("setAsPreferred", "Set as Preferred")}
                    </Button>
                  )}
                  {modelSavedHint && (
                    <p className="text-xs text-green-500 mt-2">
                      Model saved and reloading — new messages will use this model.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}
