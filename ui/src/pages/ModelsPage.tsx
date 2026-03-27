import {
  Cpu,
  Download,
  Star,
  Trash2,
  RefreshCw,
  Plus,
  Activity,
  HardDrive,
  Zap,
  Cloud,
  CloudOff,
  Check,
  Key,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProviderStatus = "connected" | "disconnected" | "error";

interface Provider {
  name: string;
  url: string;
  status: ProviderStatus;
  version: string | null;
  modelCount: number;
}

interface Model {
  id: string;
  name: string;
  provider: string;
  size: string;
  parameters: string;
  quantization: string;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_PROVIDERS: Provider[] = [
  {
    name: "Ollama",
    url: "http://localhost:11434",
    status: "connected",
    version: "0.5.4",
    modelCount: 3,
  },
  {
    name: "LM Studio",
    url: "http://localhost:1234",
    status: "disconnected",
    version: null,
    modelCount: 0,
  },
];

const DEMO_MODELS: Model[] = [
  {
    id: "llama3.2:latest",
    name: "Llama 3.2",
    provider: "Ollama",
    size: "2.0 GB",
    parameters: "3B",
    quantization: "Q4_K_M",
    isDefault: true,
  },
  {
    id: "mistral:latest",
    name: "Mistral 7B",
    provider: "Ollama",
    size: "4.1 GB",
    parameters: "7B",
    quantization: "Q4_0",
    isDefault: false,
  },
  {
    id: "codellama:13b",
    name: "Code Llama 13B",
    provider: "Ollama",
    size: "7.4 GB",
    parameters: "13B",
    quantization: "Q4_0",
    isDefault: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<ProviderStatus, { dot: string; label: string; badge: string }> = {
  connected: {
    dot: "bg-green-400",
    label: "Connected",
    badge: "bg-green-900/50 text-green-400 border-green-800/50",
  },
  disconnected: {
    dot: "bg-neutral-500",
    label: "Disconnected",
    badge: "bg-neutral-800/50 text-neutral-400 border-neutral-700/50",
  },
  error: {
    dot: "bg-red-400",
    label: "Error",
    badge: "bg-red-900/50 text-red-400 border-red-800/50",
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProviderCard({
  provider,
  onRefresh,
}: {
  provider: Provider;
  onRefresh: (name: string) => void;
}) {
  const { t } = useTranslation("models");
  const style = STATUS_STYLES[provider.status];

  return (
    <div className="rounded-xl glass-panel-interactive p-4 flex flex-col gap-3 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--glass-subtle-hover)] flex items-center justify-center">
            <Cpu className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">{provider.name}</h3>
            <p className="text-[11px] text-neutral-500 font-mono">{provider.url}</p>
          </div>
        </div>
        <button
          onClick={() => onRefresh(provider.name)}
          className="p-1.5 rounded-md hover:bg-[var(--glass-subtle-hover)] transition-colors duration-200 cursor-pointer"
          title={t("refreshProvider", "Refresh")}
        >
          <RefreshCw className="w-3.5 h-3.5 text-neutral-500 hover:text-neutral-300 transition-colors" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border",
            style.badge,
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
          {style.label}
        </span>
        {provider.version && (
          <span className="text-[11px] text-neutral-500">v{provider.version}</span>
        )}
      </div>

      <div className="text-xs text-neutral-400">
        {provider.modelCount > 0
          ? t("modelCountAvailable", "{{count}} model(s) available", { count: provider.modelCount })
          : t("noModelsAvailable", "No models available")}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  onSetDefault,
  onDelete,
}: {
  model: Model;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("models");

  return (
    <div
      className={cn(
        "rounded-xl glass-panel-interactive p-4 flex flex-col gap-3 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 transition-all duration-300",
        model.isDefault && "border-orange-700/40",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {model.isDefault && <Star className="w-4 h-4 text-orange-400 fill-orange-400 shrink-0" />}
          <div>
            <h4 className="text-sm font-semibold text-neutral-100">{model.name}</h4>
            <p className="text-[11px] text-neutral-500 font-mono">{model.id}</p>
          </div>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {model.parameters}
        </Badge>
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-400">
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3" />
          {model.provider}
        </span>
        <span className="flex items-center gap-1">
          <HardDrive className="w-3 h-3" />
          {model.size}
        </span>
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          {model.quantization}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        {!model.isDefault ? (
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] h-7"
            onClick={() => onSetDefault(model.id)}
          >
            <Check className="w-3 h-3 mr-1" />
            {t("setAsDefault", "Set as Default")}
          </Button>
        ) : (
          <span className="text-[11px] text-orange-400 font-medium">
            {t("defaultModel", "Default")}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] h-7 ml-auto text-neutral-500 hover:text-red-400"
          onClick={() => onDelete(model.id)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function HealthMonitorPanel({
  activeModel,
  provider,
  status,
  tokensPerSec,
  memoryUsage,
}: {
  activeModel: string;
  provider: string;
  status: "ready" | "loading" | "error";
  tokensPerSec: string;
  memoryUsage: string;
}) {
  const { t } = useTranslation("models");

  const statusStyles: Record<string, { color: string; label: string }> = {
    ready: { color: "text-green-400", label: t("statusReady", "Ready") },
    loading: { color: "text-amber-400", label: t("statusLoading", "Loading") },
    error: { color: "text-red-400", label: t("statusError", "Error") },
  };

  const s = statusStyles[status] ?? statusStyles.ready;

  return (
    <div className="rounded-2xl glass-panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-neutral-100">
          {t("healthMonitor", "Health Monitor")}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-neutral-500 mb-0.5">
            {t("activeModel", "Active Model")}
          </div>
          <div className="text-sm font-medium text-neutral-200">{activeModel}</div>
          <div className="text-[11px] text-neutral-500">{provider}</div>
        </div>

        <div>
          <div className="text-[11px] text-neutral-500 mb-0.5">{t("status", "Status")}</div>
          <div className={cn("text-sm font-semibold flex items-center gap-1.5", s.color)}>
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                status === "ready"
                  ? "bg-green-400"
                  : status === "loading"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-red-400",
              )}
            />
            {s.label}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-neutral-500 mb-0.5">
            {t("inferenceSpeed", "Inference Speed")}
          </div>
          <div className="text-sm font-mono text-neutral-200">{tokensPerSec}</div>
        </div>

        <div>
          <div className="text-[11px] text-neutral-500 mb-0.5">{t("memoryUsage", "Memory")}</div>
          <div className="text-sm font-mono text-neutral-200">{memoryUsage}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Configure Provider dialog (inline)
// ---------------------------------------------------------------------------

const PROVIDER_PRESETS = [
  { value: "anthropic", label: "Anthropic (Claude)", type: "anthropic-messages", needsKey: true },
  { value: "openai", label: "OpenAI (GPT)", type: "openai-completions", needsKey: true },
  { value: "ollama", label: "Ollama (local)", type: "ollama", needsKey: false },
] as const;

function ConfigureProviderForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("models");
  const [preset, setPreset] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [saving, setSaving] = useState(false);

  const selected = PROVIDER_PRESETS.find((p) => p.value === preset) ?? PROVIDER_PRESETS[0];

  async function handleSave() {
    setSaving(true);
    const providerConfig: Record<string, unknown> = { type: selected.type };
    if (selected.needsKey && apiKey.trim()) {
      providerConfig.apiKey = apiKey.trim();
    }
    if (!selected.needsKey) {
      providerConfig.baseUrl = baseUrl.trim() || "http://localhost:11434";
    }

    await gatewayRpc("config.patch", {
      patch: { models: { providers: { [preset]: providerConfig } } },
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="rounded-xl glass-panel p-4 mb-4 space-y-3">
      <h3 className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
        <Key className="w-3.5 h-3.5 text-orange-400" />
        {t("configureProvider", "Configure AI Provider")}
      </h3>
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
        className="w-full sm:w-64 h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 focus:border-orange-500 focus:outline-none transition-colors cursor-pointer"
      >
        {PROVIDER_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {selected.needsKey ? (
        <Input
          type="password"
          placeholder={t("apiKeyPlaceholder", "Paste your API key")}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      ) : (
        <Input
          placeholder="http://localhost:11434"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="text-xs"
          onClick={handleSave}
          disabled={saving || (selected.needsKey && !apiKey.trim())}
        >
          {saving ? t("saving", "Saving...") : t("saveProvider", "Save")}
        </Button>
        <Button variant="ghost" size="sm" className="text-xs" onClick={onDone}>
          {t("cancel", "Cancel")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ModelsPage() {
  const { t } = useTranslation("models");

  // --- State ---
  const [providers, setProviders] = useState<Provider[]>(DEMO_PROVIDERS);
  const [models, setModels] = useState<Model[]>(DEMO_MODELS);
  const [pullInput, setPullInput] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [cloudFallback, setCloudFallback] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderUrl, setNewProviderUrl] = useState("");
  const [configuringProvider, setConfiguringProvider] = useState(false);
  const [, setLiveMode] = useState(false);

  // Fetch real config + model catalog from gateway on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchLiveData() {
      try {
        // Fetch providers from config
        const configResult = await gatewayRpc<{ raw?: string }>("config.get", {});
        if (cancelled) {
          return;
        }
        if (configResult.ok && configResult.payload?.raw) {
          const config = JSON.parse(configResult.payload.raw);
          const configProviders = config?.models?.providers;
          if (configProviders && Object.keys(configProviders).length > 0) {
            const realProviders: Provider[] = Object.entries(configProviders).map(
              ([name, cfg]: [string, unknown]) => {
                const c = cfg as Record<string, unknown>;
                return {
                  name: name.charAt(0).toUpperCase() + name.slice(1),
                  url:
                    (c.baseUrl as string) ??
                    (c.type === "ollama" ? "http://localhost:11434" : "API"),
                  status: "connected" as ProviderStatus,
                  version: null,
                  modelCount: Array.isArray(c.models) ? c.models.length : 0,
                };
              },
            );
            setProviders(realProviders);
            setLiveMode(true);
          }
        }

        // Fetch model catalog
        const modelsResult = await gatewayRpc<{
          models?: Array<{
            id: string;
            name?: string;
            provider?: string;
            size?: string;
            parameters?: string;
            quantization?: string;
          }>;
        }>("models.list", {});
        if (cancelled) {
          return;
        }
        if (
          modelsResult.ok &&
          Array.isArray(modelsResult.payload?.models) &&
          modelsResult.payload.models.length > 0
        ) {
          const catalogModels: Model[] = modelsResult.payload.models.map((m, i) => ({
            id: m.id,
            name: m.name ?? m.id.split(":")[0],
            provider: m.provider ?? "Unknown",
            size: m.size ?? "—",
            parameters: m.parameters ?? "—",
            quantization: m.quantization ?? "—",
            isDefault: i === 0,
          }));
          setModels(catalogModels);
        }
      } catch {
        // Gateway offline — keep demo data
      }
    }
    void fetchLiveData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive default model id
  const defaultModelId = models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? "";

  // --- Handlers ---

  async function handleRefreshProvider(name: string) {
    // Try to ping the provider's URL to check if it's reachable
    const provider = providers.find((p) => p.name === name);
    if (!provider) {
      return;
    }
    try {
      const resp = await fetch(provider.url, { method: "GET", signal: AbortSignal.timeout(3000) });
      setProviders((prev) =>
        prev.map((p) => (p.name === name ? { ...p, status: resp.ok ? "connected" : "error" } : p)),
      );
    } catch {
      setProviders((prev) =>
        prev.map((p) => (p.name === name ? { ...p, status: "disconnected" } : p)),
      );
    }
  }

  function handleSetDefault(id: string) {
    setModels((prev) => prev.map((m) => ({ ...m, isDefault: m.id === id })));
    // Persist default model to gateway config
    void gatewayRpc("config.patch", {
      patch: { models: { defaultModel: id } },
    });
  }

  function handleDeleteModel(id: string) {
    setModels((prev) => {
      const filtered = prev.filter((m) => m.id !== id);
      // If the deleted model was the default, promote the first remaining model
      if (filtered.length > 0 && !filtered.some((m) => m.isDefault)) {
        filtered[0] = { ...filtered[0], isDefault: true };
      }
      return filtered;
    });
  }

  async function handlePullModel() {
    if (!pullInput.trim()) {
      return;
    }
    setIsPulling(true);
    try {
      // Try to pull via Ollama's API directly (gateway proxies if available)
      const ollamaUrl =
        providers.find((p) => p.name.toLowerCase() === "ollama")?.url ?? "http://localhost:11434";
      const resp = await fetch(`${ollamaUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pullInput.trim(), stream: false }),
      });
      if (resp.ok) {
        // Re-fetch model catalog to get updated list
        const modelsResult = await gatewayRpc<{
          models?: Array<{
            id: string;
            name?: string;
            provider?: string;
            size?: string;
            parameters?: string;
            quantization?: string;
          }>;
        }>("models.list", {});
        if (modelsResult.ok && Array.isArray(modelsResult.payload?.models)) {
          const currentDefault = models.find((m) => m.isDefault)?.id;
          setModels(
            modelsResult.payload.models.map((m) => ({
              id: m.id,
              name: m.name ?? m.id.split(":")[0],
              provider: m.provider ?? "Ollama",
              size: m.size ?? "—",
              parameters: m.parameters ?? "—",
              quantization: m.quantization ?? "—",
              isDefault: m.id === currentDefault,
            })),
          );
        }
      } else {
        // Fallback: add optimistically
        setModels((prev) => [
          ...prev,
          {
            id: pullInput.trim(),
            name: pullInput.trim().split(":")[0],
            provider: "Ollama",
            size: "—",
            parameters: "—",
            quantization: "—",
            isDefault: false,
          },
        ]);
      }
    } catch {
      // Ollama not reachable — add optimistically
      setModels((prev) => [
        ...prev,
        {
          id: pullInput.trim(),
          name: pullInput.trim().split(":")[0],
          provider: "Ollama",
          size: "—",
          parameters: "—",
          quantization: "—",
          isDefault: false,
        },
      ]);
    }
    setPullInput("");
    setIsPulling(false);
    setProviders((prev) =>
      prev.map((p) => (p.name === "Ollama" ? { ...p, modelCount: p.modelCount + 1 } : p)),
    );
  }

  function handleDefaultModelChange(id: string) {
    setModels((prev) => prev.map((m) => ({ ...m, isDefault: m.id === id })));
  }

  function handleAddProvider() {
    if (!newProviderName.trim() || !newProviderUrl.trim()) {
      return;
    }
    const provider: Provider = {
      name: newProviderName.trim(),
      url: newProviderUrl.trim(),
      status: "disconnected",
      version: null,
      modelCount: 0,
    };
    setProviders((prev) => [...prev, provider]);
    setNewProviderName("");
    setNewProviderUrl("");
    setAddingProvider(false);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-100">{t("title", "AI Models")}</h1>
        <p className="text-sm text-neutral-400 mt-1">
          {t("subtitle", "Manage local LLM providers and model preferences")}
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Section 1: Provider Status                                        */}
      {/* ----------------------------------------------------------------- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-orange-400" />
            {t("providerStatus", "Provider Status")}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setConfiguringProvider(true)}
            >
              <Key className="w-3.5 h-3.5 mr-1" />
              {t("configureProvider", "Configure Provider")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setAddingProvider(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t("addProvider", "Add Provider")}
            </Button>
          </div>
        </div>

        {/* Configure cloud/local provider */}
        {configuringProvider && (
          <ConfigureProviderForm onDone={() => setConfiguringProvider(false)} />
        )}

        {/* Add provider form */}
        {addingProvider && (
          <div className="rounded-xl glass-panel p-4 mb-3 space-y-3">
            <h3 className="text-xs font-semibold text-neutral-300">
              {t("addCustomEndpoint", "Add OpenAI-compatible endpoint")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder={t("providerNamePlaceholder", "Provider name")}
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
              />
              <Input
                placeholder={t("providerUrlPlaceholder", "http://localhost:8080")}
                value={newProviderUrl}
                onChange={(e) => setNewProviderUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="text-xs" onClick={handleAddProvider}>
                {t("add", "Add")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setAddingProvider(false);
                  setNewProviderName("");
                  setNewProviderUrl("");
                }}
              >
                {t("cancel", "Cancel")}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.name}
              provider={provider}
              onRefresh={handleRefreshProvider}
            />
          ))}
        </div>
      </section>

      <Separator />

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: Available Models                                       */}
      {/* ----------------------------------------------------------------- */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4 text-orange-400" />
          {t("availableModels", "Available Models")}
          {models.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {models.length}
            </Badge>
          )}
        </h2>

        {models.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onSetDefault={handleSetDefault}
                onDelete={handleDeleteModel}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl glass-panel p-8 text-center">
            <Cpu className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <p className="text-sm text-neutral-400">
              {t(
                "noModels",
                "No models available. Connect a provider or pull a model to get started.",
              )}
            </p>
          </div>
        )}

        {/* Pull model */}
        <div className="rounded-xl glass-panel p-4 mt-3">
          <h3 className="text-xs font-semibold text-neutral-300 mb-2 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-orange-400" />
            {t("pullModel", "Pull Model")}
          </h3>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("pullModelPlaceholder", "e.g. llama3.2:latest, mistral:7b-instruct")}
              value={pullInput}
              onChange={(e) => setPullInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePullModel()}
              className="flex-1"
            />
            <Button
              size="sm"
              className="text-xs shrink-0"
              disabled={!pullInput.trim() || isPulling}
              onClick={handlePullModel}
            >
              {isPulling ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                  {t("pulling", "Pulling...")}
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  {t("pull", "Pull")}
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* ----------------------------------------------------------------- */}
      {/* Section 3: Settings + Section 4: Health Monitor (side by side)    */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Settings (takes 2 cols) */}
        <section className="lg:col-span-2 rounded-2xl glass-panel p-5 space-y-5">
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-400" />
            {t("settings", "Settings")}
          </h2>

          {/* Default model selector */}
          <div>
            <label className="text-xs text-neutral-400 block mb-1.5">
              {t("defaultModelLabel", "Default Model")}
            </label>
            <select
              value={defaultModelId}
              onChange={(e) => handleDefaultModelChange(e.target.value)}
              className="w-full sm:w-72 h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 focus:border-orange-500 focus:outline-none transition-colors cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.parameters}) - {m.provider}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-500 mt-1">
              {t(
                "defaultModelDesc",
                "The model used for inference when no specific model is requested.",
              )}
            </p>
          </div>

          <Separator />

          {/* Cloud fallback toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2 mb-0.5">
                {cloudFallback ? (
                  <Cloud className="w-4 h-4 text-orange-400" />
                ) : (
                  <CloudOff className="w-4 h-4 text-neutral-500" />
                )}
                <span className="text-sm font-medium text-neutral-200">
                  {t("cloudFallback", "Cloud Fallback")}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 pl-6">
                {t(
                  "cloudFallbackDesc",
                  "When enabled, requests fall back to a cloud provider if local inference is unavailable or too slow.",
                )}
              </p>
            </div>
            <button
              onClick={() => setCloudFallback((prev) => !prev)}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer shrink-0",
                cloudFallback ? "bg-orange-600" : "bg-neutral-700",
              )}
              role="switch"
              aria-checked={cloudFallback}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                  cloudFallback && "translate-x-5",
                )}
              />
            </button>
          </div>

          <Separator />

          {/* Auto-detect toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2 mb-0.5">
                <RefreshCw
                  className={cn("w-4 h-4", autoDetect ? "text-orange-400" : "text-neutral-500")}
                />
                <span className="text-sm font-medium text-neutral-200">
                  {t("autoDetect", "Auto-detect Providers")}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 pl-6">
                {t(
                  "autoDetectDesc",
                  "Automatically scan for local LLM providers (Ollama, LM Studio) on startup.",
                )}
              </p>
            </div>
            <button
              onClick={() => setAutoDetect((prev) => !prev)}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer shrink-0",
                autoDetect ? "bg-orange-600" : "bg-neutral-700",
              )}
              role="switch"
              aria-checked={autoDetect}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                  autoDetect && "translate-x-5",
                )}
              />
            </button>
          </div>
        </section>

        {/* Section 4: Health Monitor */}
        <section className="lg:col-span-1">
          <HealthMonitorPanel
            activeModel={models.find((m) => m.isDefault)?.name ?? "None"}
            provider={models.find((m) => m.isDefault)?.provider ?? "-"}
            status="ready"
            tokensPerSec="~45 tok/s"
            memoryUsage="2.1 / 16 GB"
          />
        </section>
      </div>
    </div>
  );
}
