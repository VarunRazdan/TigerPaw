import {
  Check,
  ChevronRight,
  MessageSquare,
  TrendingUp,
  Sparkles,
  Loader2,
  AlertCircle,
  Shield,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Bot,
  Bell,
  BarChart3,
  Calendar,
  Workflow,
  ShieldCheck,
  LineChart,
  MessageCircle,
  Gamepad2,
  ChevronDown,
  ChevronUp,
  Zap,
  Star,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ConnectDialog } from "@/components/ConnectDialog";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useOnboarding, type StepId, type ProviderTestStatus } from "@/hooks/use-onboarding";
import { CHANNEL_CONNECT_INFO, TRADING_CONNECT_INFO } from "@/lib/connect-config";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { MODELS_CATALOG, formatTokens, formatPrice } from "@/lib/models-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTradingStore } from "@/stores/trading-store";

// ── AI Provider definitions ──────────────────────────────────────

type AiProvider = {
  id: string;
  key: string;
  local?: boolean;
  pricingUrl: string;
  pricing: string;
  models: string;
  fields: { name: string; i18nKey: string; type: "password" | "text" }[];
};

const AI_PROVIDERS: AiProvider[] = [
  {
    id: "anthropic",
    key: "anthropic",
    pricingUrl: "https://www.anthropic.com/pricing",
    pricing: "$3-15 / 1M tokens",
    models: "Claude Opus, Sonnet, Haiku",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "openai",
    key: "openai",
    pricingUrl: "https://openai.com/api/pricing/",
    pricing: "$0.15-60 / 1M tokens",
    models: "GPT-4.1, o3, o4-mini",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "google",
    key: "google",
    pricingUrl: "https://ai.google.dev/pricing",
    pricing: "Free tier + $1.25-10 / 1M tokens",
    models: "Gemini 2.5 Pro, Flash",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "deepseek",
    key: "deepseek",
    pricingUrl: "https://platform.deepseek.com/api_keys",
    pricing: "$0.14-2.19 / 1M tokens",
    models: "DeepSeek-V3, R1",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "groq",
    key: "groq",
    pricingUrl: "https://groq.com/pricing/",
    pricing: "Free tier + $0.04-6 / 1M tokens",
    models: "Llama 3.3 70B, Mixtral, Gemma 2",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "mistral",
    key: "mistral",
    pricingUrl: "https://mistral.ai/products/pricing",
    pricing: "$0.25-10 / 1M tokens",
    models: "Mistral Large, Medium, Small",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "xai",
    key: "xai",
    pricingUrl: "https://docs.x.ai/docs/models",
    pricing: "$2-10 / 1M tokens",
    models: "Grok 3, Grok 3 Mini",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "perplexity",
    key: "perplexity",
    pricingUrl: "https://docs.perplexity.ai/guides/pricing",
    pricing: "$1-5 / 1M tokens",
    models: "Sonar Pro, Sonar, Sonar Reasoning",
    fields: [{ name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" }],
  },
  {
    id: "ollama",
    key: "ollama",
    local: true,
    pricingUrl: "https://ollama.com/",
    pricing: "Free — runs locally",
    models: "Llama 3, Mistral, Qwen, Phi",
    fields: [{ name: "baseUrl", i18nKey: "ai.baseUrlPlaceholder", type: "text" }],
  },
  {
    id: "lmstudio",
    key: "lmstudio",
    local: true,
    pricingUrl: "https://lmstudio.ai/",
    pricing: "Free — runs locally",
    models: "Any GGUF model",
    fields: [{ name: "baseUrl", i18nKey: "ai.baseUrlPlaceholder", type: "text" }],
  },
  {
    id: "custom",
    key: "custom",
    pricingUrl: "",
    pricing: "Any OpenAI-compatible API",
    models: "Bring your own provider",
    fields: [
      { name: "baseUrl", i18nKey: "ai.customBaseUrlPlaceholder", type: "text" },
      { name: "apiKey", i18nKey: "ai.apiKeyPlaceholder", type: "password" },
    ],
  },
];

// ── Channel definitions (from connect-config) ────────────────────

const CHANNEL_IDS = Object.keys(CHANNEL_CONNECT_INFO);

// ── Trading platform definitions (from connect-config) ───────────

const PLATFORM_IDS = Object.keys(TRADING_CONNECT_INFO);

const STEP_IDS: StepId[] = ["ai", "messaging", "trading", "complete"];

// ── Shared sub-components ────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            i === current
              ? "w-10 bg-orange-500"
              : i < current
                ? "w-6 bg-orange-500/50"
                : "w-6 bg-neutral-700",
          )}
        />
      ))}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-9 rounded-lg bg-neutral-900/60 border border-neutral-700/50 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-colors"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
        tabIndex={-1}
      >
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function TestStatusBadge({
  status,
  detail,
  error,
}: {
  status: ProviderTestStatus;
  detail: string | null;
  error: string | null;
}) {
  if (status === "idle") {
    return null;
  }
  if (status === "testing") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-orange-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        {detail ?? "Testing..."}
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-400">
        <Check className="w-3 h-3" />
        {detail ?? "Connected"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-red-400">
      <AlertCircle className="w-3 h-3" />
      {error ?? "Connection failed"}
    </span>
  );
}

// ── Models Panel (static + dynamic refresh) ─────────────────────

function ModelsPanel({
  providerId,
  canRefresh,
  credentials,
}: {
  providerId: string;
  canRefresh: boolean;
  credentials: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [liveModels, setLiveModels] = useState<{ id: string; name: string }[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const catalog = MODELS_CATALOG[providerId];
  if (!catalog) {
    return null;
  }

  const staticModels = catalog.models;
  const displayModels: { id: string; name: string }[] = liveModels ?? staticModels;
  const isLive = liveModels !== null;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await gatewayRpc<{ ok?: boolean; models?: { id: string; name: string }[] }>(
        "onboarding.models",
        { provider: providerId, credentials },
      );
      if (result.ok && result.payload?.ok && result.payload.models?.length) {
        setLiveModels(result.payload.models);
      }
    } catch {
      // Silently fall back to static
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-800/60 bg-neutral-950/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-neutral-400 hover:text-neutral-300 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          {displayModels.length} models available
          {isLive && <span className="text-green-500 text-[9px]">(live)</span>}
          {!isLive && (
            <span className="text-neutral-600 text-[9px]">(catalog {catalog.lastUpdated})</span>
          )}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 animate-in slide-in-from-top-1 duration-150">
          {/* Refresh button */}
          {canRefresh && !isLive && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 mb-2 cursor-pointer disabled:opacity-50"
            >
              {refreshing ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Fetching live models...
                </>
              ) : (
                <>
                  <RefreshCw className="w-2.5 h-2.5" />
                  Refresh from API
                </>
              )}
            </button>
          )}

          {/* Model table */}
          <div className="space-y-0.5 max-h-[160px] overflow-y-auto">
            {/* Header */}
            <div className="grid grid-cols-[1fr_60px_60px_60px] gap-1 text-[9px] text-neutral-600 uppercase tracking-wider pb-1 border-b border-neutral-800/40">
              <span>Model</span>
              <span className="text-right">Context</span>
              <span className="text-right">Input</span>
              <span className="text-right">Output</span>
            </div>
            {displayModels.map((m) => {
              const catalogModel = staticModels.find((s) => s.id === m.id);

              return (
                <div
                  key={m.id}
                  className="grid grid-cols-[1fr_60px_60px_60px] gap-1 text-[10px] py-0.5"
                >
                  <span className="text-neutral-300 truncate flex items-center gap-1">
                    {m.name}
                    {catalogModel?.reasoning && (
                      <span className="text-[8px] px-1 py-0 rounded bg-purple-900/30 text-purple-400">
                        R
                      </span>
                    )}
                  </span>
                  <span className="text-neutral-500 text-right">
                    {catalogModel ? formatTokens(catalogModel.contextWindow) : "\u2014"}
                  </span>
                  <span className="text-neutral-500 text-right">
                    {catalogModel ? formatPrice(catalogModel.pricing.input) : "\u2014"}
                  </span>
                  <span className="text-neutral-500 text-right">
                    {catalogModel ? formatPrice(catalogModel.pricing.output) : "\u2014"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-neutral-600 mt-1.5">
            Prices per 1M tokens. R = reasoning model.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Step 1: AI Provider ──────────────────────────────────────────

function AiProviderStep({
  aiStep,
  providerStates,
  preferredProvider,
  detectedProviders,
  isDetecting,
  onSelect,
  onSetCredential,
  onTest,
  onSetPreferred,
}: {
  aiStep: ReturnType<typeof useOnboarding>["aiStep"];
  providerStates: Record<string, { saved: boolean; testStatus: string }>;
  preferredProvider: string | null;
  detectedProviders: Record<string, boolean>;
  isDetecting: boolean;
  onSelect: (id: string) => void;
  onSetCredential: (field: string, value: string) => void;
  onTest: () => void;
  onSetPreferred: (id: string) => void;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
      {AI_PROVIDERS.map((p) => {
        const isExpanded = aiStep.selectedProvider === p.id;
        const provState = providerStates[p.id];
        const isConfigured = provState?.saved;
        const isPreferred = preferredProvider === p.id;
        const isDetected = p.local && detectedProviders[p.id];

        let badge: string | undefined;
        if (p.local) {
          if (isDetecting) {
            badge = t("ai.detecting");
          } else if (isDetected) {
            badge = t("ai.detected");
          } else {
            badge = t("ai.notDetected");
          }
        }

        return (
          <div key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left cursor-pointer",
                isConfigured
                  ? "border-green-600/40 bg-green-950/10"
                  : isExpanded
                    ? "border-orange-500/60 bg-orange-950/20 shadow-lg shadow-orange-900/10"
                    : "border-neutral-700/50 bg-neutral-900/30 hover:border-neutral-600 hover:bg-neutral-800/30",
              )}
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors overflow-hidden",
                  isConfigured
                    ? "bg-green-500/15"
                    : isExpanded
                      ? "bg-orange-500/20"
                      : "bg-neutral-800",
                )}
              >
                <img
                  src={`/icons/ai-providers/${p.id}.svg`}
                  alt={t(`ai.${p.key}`)}
                  className="w-5 h-5"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isConfigured
                        ? "text-green-300"
                        : isExpanded
                          ? "text-orange-300"
                          : "text-neutral-200",
                    )}
                  >
                    {t(`ai.${p.key}`)}
                  </span>
                  {badge && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        isDetected
                          ? "bg-green-900/40 text-green-400"
                          : "bg-neutral-800 text-neutral-500",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                  {isConfigured && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400 font-medium">
                      {t("configured")}
                    </span>
                  )}
                  {isPreferred && isConfigured && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400 font-medium">
                      Preferred
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-neutral-500">{t(`ai.${p.key}Desc`)}</span>
                  <span className="text-[11px] text-neutral-600">·</span>
                  <span className="text-[11px] text-neutral-500">{p.models}</span>
                  {p.pricingUrl && (
                    <a
                      href={p.pricingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-neutral-600 hover:text-orange-400 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isConfigured && !isPreferred && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetPreferred(p.id);
                    }}
                    className="text-neutral-600 hover:text-amber-400 transition-colors cursor-pointer p-0.5"
                    title="Set as preferred"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                {isPreferred && isConfigured && (
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                )}
                {isConfigured && <CheckCircle2 className="w-4 h-4 text-green-400" />}
              </div>
            </button>

            {/* Credential form */}
            {isExpanded && (
              <div className="mt-2 ml-12 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                {p.fields.map((field) =>
                  field.type === "password" ? (
                    <PasswordInput
                      key={field.name}
                      value={aiStep.credentials[field.name] ?? ""}
                      onChange={(v) => onSetCredential(field.name, v)}
                      placeholder={t(field.i18nKey)}
                    />
                  ) : (
                    <input
                      key={field.name}
                      type="text"
                      value={aiStep.credentials[field.name] ?? ""}
                      onChange={(e) => onSetCredential(field.name, e.target.value)}
                      placeholder={t(field.i18nKey)}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/60 border border-neutral-700/50 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-colors"
                    />
                  ),
                )}
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                  <Shield className="w-3 h-3 shrink-0" />
                  <span>{t("ai.securityNote")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onTest}
                    disabled={
                      aiStep.testStatus === "testing" ||
                      (!p.local && !(aiStep.credentials[p.fields[0].name] ?? "").trim())
                    }
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                      aiStep.testStatus !== "testing" &&
                        (p.local || (aiStep.credentials[p.fields[0].name] ?? "").trim())
                        ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                        : "bg-neutral-800/50 text-neutral-600 cursor-not-allowed",
                    )}
                  >
                    {aiStep.testStatus === "testing" ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t("testing")}
                      </>
                    ) : aiStep.testStatus === "error" ? (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        {t("retryTest")}
                      </>
                    ) : (
                      <>
                        <Check className="w-3 h-3" />
                        {t("testConnection")}
                      </>
                    )}
                  </button>
                  <TestStatusBadge
                    status={aiStep.testStatus}
                    detail={aiStep.testDetail}
                    error={aiStep.testError}
                  />
                </div>
                <ModelsPanel
                  providerId={p.id}
                  canRefresh={aiStep.testStatus === "success"}
                  credentials={aiStep.credentials}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 2: Channels Grid ────────────────────────────────────────

function ChannelsGridStep() {
  const { t } = useTranslation("onboarding");
  const channelStatuses = useAppStore((s) => s.channelStatuses);
  const [connectIcon, setConnectIcon] = useState<string | null>(null);
  const connectInfo = connectIcon ? CHANNEL_CONNECT_INFO[connectIcon] : null;

  const connectedSet = new Set(channelStatuses?.filter((c) => c.connected).map((c) => c.id) ?? []);

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
        {CHANNEL_IDS.map((id) => {
          const info = CHANNEL_CONNECT_INFO[id];
          const isConnected = connectedSet.has(id);

          return (
            <button
              key={id}
              type="button"
              onClick={() => setConnectIcon(id)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 cursor-pointer",
                isConnected
                  ? "border-green-600/40 bg-green-950/15"
                  : "border-neutral-700/50 bg-neutral-900/30 hover:border-neutral-600 hover:bg-neutral-800/30",
              )}
            >
              <div className="relative">
                <img
                  src={`/icons/messaging-channels/${id}.svg`}
                  alt={info.name}
                  className="w-7 h-7"
                />
                {isConnected && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 absolute -top-1 -right-1" />
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium text-center leading-tight",
                  isConnected ? "text-green-400" : "text-neutral-400",
                )}
              >
                {info.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-600 mt-2">{t("messaging.clickToConnect")}</p>
      {connectInfo && (
        <ConnectDialog
          open={!!connectIcon}
          onOpenChange={(open) => {
            if (!open) {
              setConnectIcon(null);
            }
          }}
          info={connectInfo}
        />
      )}
    </>
  );
}

// ── Step 3: Trading Platforms Grid ───────────────────────────────

function TradingGridStep() {
  const { t } = useTranslation("onboarding");
  const platforms = useTradingStore((s) => s.platforms);
  const [connectId, setConnectId] = useState<string | null>(null);
  const connectInfo = connectId ? TRADING_CONNECT_INFO[connectId] : null;

  const connectedSet = new Set(
    Object.entries(platforms)
      .filter(([, p]) => p.connected)
      .map(([id]) => id),
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {PLATFORM_IDS.map((id) => {
          const info = TRADING_CONNECT_INFO[id];
          const isConnected = connectedSet.has(id);

          return (
            <button
              key={id}
              type="button"
              onClick={() => setConnectId(id)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 cursor-pointer",
                isConnected
                  ? "border-green-600/40 bg-green-950/15"
                  : "border-neutral-700/50 bg-neutral-900/30 hover:border-neutral-600 hover:bg-neutral-800/30",
              )}
            >
              <div className="relative">
                <PlatformIcon platformId={id} className="w-7 h-7" />
                {isConnected && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 absolute -top-1 -right-1" />
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium text-center leading-tight",
                  isConnected ? "text-green-400" : "text-neutral-400",
                )}
              >
                {info.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-600 mt-2">{t("trading.clickToConnect")}</p>
      {connectInfo && (
        <ConnectDialog
          open={!!connectId}
          onOpenChange={(open) => {
            if (!open) {
              setConnectId(null);
            }
          }}
          info={connectInfo}
        />
      )}
    </>
  );
}

// ── Step 4: Completion with use-case examples ────────────────────

type UseCaseExample = {
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
  href: string;
  requires?: "ai" | "messaging" | "trading";
};

const USE_CASES: UseCaseExample[] = [
  {
    icon: <Bot className="w-5 h-5" />,
    titleKey: "examples.chatJarvis",
    descKey: "examples.chatJarvisDesc",
    href: "/assistant",
    requires: "ai",
  },
  {
    icon: <Calendar className="w-5 h-5" />,
    titleKey: "examples.dailyBriefing",
    descKey: "examples.dailyBriefingDesc",
    href: "/workflows",
    requires: "ai",
  },
  {
    icon: <Workflow className="w-5 h-5" />,
    titleKey: "examples.createWorkflow",
    descKey: "examples.createWorkflowDesc",
    href: "/workflows",
  },
  {
    icon: <MessageCircle className="w-5 h-5" />,
    titleKey: "examples.sendMessage",
    descKey: "examples.sendMessageDesc",
    href: "/channels",
    requires: "messaging",
  },
  {
    icon: <Bell className="w-5 h-5" />,
    titleKey: "examples.notifications",
    descKey: "examples.notificationsDesc",
    href: "/channels",
    requires: "messaging",
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    titleKey: "examples.checkPortfolio",
    descKey: "examples.checkPortfolioDesc",
    href: "/assistant",
    requires: "trading",
  },
  {
    icon: <LineChart className="w-5 h-5" />,
    titleKey: "examples.marketPrices",
    descKey: "examples.marketPricesDesc",
    href: "/",
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    titleKey: "examples.riskControls",
    descKey: "examples.riskControlsDesc",
    href: "/trading/settings",
    requires: "trading",
  },
  {
    icon: <Gamepad2 className="w-5 h-5" />,
    titleKey: "examples.paperTrade",
    descKey: "examples.paperTradeDesc",
    href: "/trading",
    requires: "trading",
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    titleKey: "examples.chatTrading",
    descKey: "examples.chatTradingDesc",
    href: "/assistant",
    requires: "trading",
  },
];

function CompletionStep({
  aiConfigured,
  channelsConnected,
  platformsConnected,
  onFinish,
}: {
  aiConfigured: boolean;
  channelsConnected: number;
  platformsConnected: number;
  onFinish: (withDemoData: boolean) => void;
}) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const [demoData, setDemoData] = useState(true);

  const sections = [
    { key: "ai", label: t("ai.title"), configured: aiConfigured },
    { key: "messaging", label: t("messaging.title"), configured: channelsConnected > 0 },
    { key: "trading", label: t("trading.title"), configured: platformsConnected > 0 },
  ];

  function handleExample(href: string) {
    onFinish(demoData);
    void navigate(href);
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-900/30 p-4">
        <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
          {t("complete.summaryTitle")}
        </h4>
        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.key} className="flex items-center gap-2.5">
              {s.configured ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-neutral-600 shrink-0" />
              )}
              <span
                className={cn("text-sm", s.configured ? "text-neutral-200" : "text-neutral-500")}
              >
                {s.label}
              </span>
              <span
                className={cn(
                  "text-[10px] ml-auto",
                  s.configured ? "text-green-400" : "text-neutral-600",
                )}
              >
                {s.configured ? t("complete.configured") : t("complete.notConfigured")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Use-case examples — visual grid of 10 cards */}
      <div>
        <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
          {t("complete.whatYouCanDo")}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {USE_CASES.map((uc) => {
            const isAvailable =
              !uc.requires ||
              (uc.requires === "ai" && aiConfigured) ||
              (uc.requires === "messaging" && channelsConnected > 0) ||
              (uc.requires === "trading" && platformsConnected > 0);

            return (
              <button
                key={uc.titleKey}
                type="button"
                onClick={() => handleExample(uc.href)}
                className={cn(
                  "group flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all cursor-pointer",
                  isAvailable
                    ? "border-neutral-700/50 bg-neutral-900/30 hover:border-orange-600/40 hover:bg-orange-950/10"
                    : "border-neutral-800/40 bg-neutral-900/20 opacity-60 hover:opacity-80 hover:border-neutral-700/50",
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                    isAvailable
                      ? "bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20"
                      : "bg-neutral-800/50 text-neutral-500",
                  )}
                >
                  {uc.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium leading-tight text-neutral-200">
                    {t(uc.titleKey)}
                  </div>
                  <div className="text-[10px] text-neutral-500 leading-tight mt-0.5">
                    {t(uc.descKey)}
                  </div>
                </div>
                {!isAvailable && (
                  <span className="text-[9px] text-neutral-600 mt-auto">
                    Requires {uc.requires}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Demo data toggle */}
      <div className="rounded-xl border border-neutral-700/50 bg-neutral-900/30 p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setDemoData((v) => !v)}
            className="mt-0.5 shrink-0 cursor-pointer text-neutral-300 hover:text-orange-400 transition-colors"
          >
            {demoData ? (
              <ToggleRight className="w-8 h-8 text-orange-500" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-neutral-600" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                "text-sm font-medium cursor-pointer select-none",
                demoData ? "text-neutral-200" : "text-neutral-400",
              )}
              onClick={() => setDemoData((v) => !v)}
            >
              {t("complete.withDemoData")}
            </h4>
            <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
              Load sample portfolio positions, trade history, notifications, and workflows so you
              can explore all features immediately. You can clear demo data at any time from
              Settings.
            </p>
          </div>
        </div>
      </div>

      {/* Finish button */}
      <button
        type="button"
        onClick={() => onFinish(demoData)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/30 transition-all cursor-pointer"
      >
        {t("complete.explore")}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Skip AI Warning Dialog ───────────────────────────────────────

function SkipAiWarning({ onGoBack, onSkip }: { onGoBack: () => void; onSkip: () => void }) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 mt-3 animate-in slide-in-from-top-2 duration-200">
      <p className="text-xs text-amber-300 mb-3">{t("ai.skipWarning")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onGoBack}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all cursor-pointer"
        >
          {t("back")}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-700/40 text-amber-400 hover:bg-amber-950/40 transition-all cursor-pointer"
        >
          {t("ai.skipAnyway")}
        </button>
      </div>
    </div>
  );
}

// ── Main Wizard ──────────────────────────────────────────────────

const STEP_ICONS: Record<string, React.ReactNode> = {
  ai: <Sparkles className="w-5 h-5" />,
  messaging: <MessageSquare className="w-5 h-5" />,
  trading: <TrendingUp className="w-5 h-5" />,
  complete: <CheckCircle2 className="w-5 h-5" />,
};

export function OnboardingWizard() {
  const { t } = useTranslation("onboarding");
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  const {
    stepIndex,
    currentStepId,
    aiStep,
    providerStates,
    preferredProvider,
    anyAiConfigured,
    channelsConnected,
    platformsConnected,
    detectedProviders,
    isDetecting,
    gatewayReachable,
    selectAiProvider,
    setAiCredential,
    testAiConnection,
    setPreferred,
    nextStep,
    prevStep,
    finishOnboarding,
  } = useOnboarding();

  const isComplete = currentStepId === "complete";

  // Can advance with "Next" (not skip)?
  const canAdvance =
    isComplete ||
    (currentStepId === "ai" && anyAiConfigured) ||
    (currentStepId === "messaging" && channelsConnected > 0) ||
    (currentStepId === "trading" && platformsConnected > 0);

  const handleSkip = useCallback(() => {
    if (currentStepId === "ai" && !anyAiConfigured) {
      setShowSkipWarning(true);
      return;
    }
    setShowSkipWarning(false);
    nextStep();
  }, [currentStepId, anyAiConfigured, nextStep]);

  const handleNext = useCallback(() => {
    setShowSkipWarning(false);
    nextStep();
  }, [nextStep]);

  const handleBack = useCallback(() => {
    setShowSkipWarning(false);
    prevStep();
  }, [prevStep]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Wizard panel */}
      <div
        className={cn(
          "relative z-10 w-full mx-4 rounded-2xl border shadow-2xl overflow-hidden",
          isComplete ? "max-w-4xl" : "max-w-xl",
        )}
        style={{
          background: "var(--glass-bg)",
          borderColor: "var(--glass-border)",
        }}
      >
        {/* Inner gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-950/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-100">{t("title")}</h2>
              <p className="text-xs text-neutral-500">{t("subtitle")}</p>
            </div>
          </div>

          {/* Gateway offline banner */}
          {!gatewayReachable && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {t("gatewayOffline")}
            </div>
          )}

          {/* Step indicator */}
          <div className="flex items-center justify-between mt-4 mb-5">
            <StepIndicator current={stepIndex} total={STEP_IDS.length} />
            <span className="text-xs text-neutral-500">
              {t("step", { current: stepIndex + 1, total: STEP_IDS.length })}
            </span>
          </div>

          {/* Step title */}
          {!isComplete ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-orange-400">{STEP_ICONS[currentStepId]}</span>
                <h3 className="text-sm font-semibold text-neutral-200">
                  {t(`${currentStepId}.title`)}
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mb-4">{t(`${currentStepId}.description`)}</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-green-400">{STEP_ICONS.complete}</span>
                <h3 className="text-sm font-semibold text-neutral-200">{t("complete.title")}</h3>
              </div>
              <p className="text-xs text-neutral-500 mb-4">{t("complete.description")}</p>
            </>
          )}

          {/* Step content */}
          <div className={cn(!isComplete && "mb-5")}>
            {currentStepId === "ai" && (
              <>
                <AiProviderStep
                  aiStep={aiStep}
                  providerStates={providerStates}
                  preferredProvider={preferredProvider}
                  detectedProviders={detectedProviders}
                  isDetecting={isDetecting}
                  onSelect={selectAiProvider}
                  onSetCredential={setAiCredential}
                  onTest={testAiConnection}
                  onSetPreferred={setPreferred}
                />
                {showSkipWarning && (
                  <SkipAiWarning
                    onGoBack={() => setShowSkipWarning(false)}
                    onSkip={() => {
                      setShowSkipWarning(false);
                      nextStep();
                    }}
                  />
                )}
              </>
            )}
            {currentStepId === "messaging" && <ChannelsGridStep />}
            {currentStepId === "trading" && <TradingGridStep />}
            {currentStepId === "complete" && (
              <CompletionStep
                aiConfigured={anyAiConfigured}
                channelsConnected={channelsConnected}
                platformsConnected={platformsConnected}
                onFinish={finishOnboarding}
              />
            )}
          </div>

          {/* Navigation */}
          {!isComplete && (
            <div className="flex items-center justify-between">
              <div>
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                  >
                    {t("back")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                >
                  {t("skip")}
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canAdvance}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                    canAdvance
                      ? "bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/30 cursor-pointer"
                      : "bg-neutral-800 text-neutral-500 cursor-not-allowed",
                  )}
                >
                  {t("next")}
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
