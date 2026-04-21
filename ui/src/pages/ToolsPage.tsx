import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Search,
  Shield,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataModeSelector } from "@/components/DataModeSelector";
import { Button } from "@/components/ui/button";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { saveConfigPatch } from "@/lib/save-config";
import { notifyError } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

type SearchProvider = "brave" | "gemini" | "grok" | "kimi" | "perplexity";

const SEARCH_PROVIDERS: Array<{
  id: SearchProvider;
  label: string;
  keyUrl: string;
  keyUrlLabel: string;
  placeholder: string;
}> = [
  {
    id: "brave",
    label: "Brave Search",
    keyUrl: "https://brave.com/search/api/",
    keyUrlLabel: "brave.com/search/api",
    placeholder: "BSAxxxxxxxxxxxxx",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "aistudio.google.com",
    placeholder: "AIzaxxxxxxxxxxxxx",
  },
  {
    id: "grok",
    label: "Grok (xAI)",
    keyUrl: "https://console.x.ai/",
    keyUrlLabel: "console.x.ai",
    placeholder: "xai-xxxxxxxxxxxxx",
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    keyUrlLabel: "platform.moonshot.cn",
    placeholder: "sk-xxxxxxxxxxxxx",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    keyUrl: "https://www.perplexity.ai/settings/api",
    keyUrlLabel: "perplexity.ai/settings/api",
    placeholder: "pplx-xxxxxxxxxxxxx",
  },
];

function buildSearchPatch(provider: SearchProvider, apiKey: string) {
  const patch: Record<string, unknown> = {
    tools: {
      web: {
        search: {
          provider,
          enabled: true,
          ...(provider === "brave" ? { apiKey } : { [provider]: { apiKey } }),
        },
      },
    },
  };
  return patch;
}

// ---------------------------------------------------------------------------
// Password Input (reused from ModelsPage pattern)
// ---------------------------------------------------------------------------

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ToolsPage() {
  const { t } = useTranslation("tools");
  const demoMode = useTradingStore((s) => s.demoMode);

  // --- State ---
  const [searchExpanded, setSearchExpanded] = useState(true);
  const [firecrawlExpanded, setFirecrawlExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Search
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("brave");
  const [searchKeys, setSearchKeys] = useState<Record<SearchProvider, string>>({
    brave: "",
    gemini: "",
    grok: "",
    kimi: "",
    perplexity: "",
  });
  const [searchConfigured, setSearchConfigured] = useState<Record<SearchProvider, boolean>>({
    brave: false,
    gemini: false,
    grok: false,
    kimi: false,
    perplexity: false,
  });
  const [searchTesting, setSearchTesting] = useState(false);
  const [searchTestResult, setSearchTestResult] = useState<"idle" | "success" | "error">("idle");
  const [searchTestError, setSearchTestError] = useState<string | null>(null);
  const [searchSaving, setSearchSaving] = useState(false);
  const [searchSaved, setSearchSaved] = useState(false);

  // Firecrawl
  const [firecrawlKey, setFirecrawlKey] = useState("");
  const [firecrawlConfigured, setFirecrawlConfigured] = useState(false);
  const [firecrawlTesting, setFirecrawlTesting] = useState(false);
  const [firecrawlTestResult, setFirecrawlTestResult] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [firecrawlTestError, setFirecrawlTestError] = useState<string | null>(null);
  const [firecrawlSaving, setFirecrawlSaving] = useState(false);
  const [firecrawlSaved, setFirecrawlSaved] = useState(false);

  // --- Load config ---
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
          const search = cfg?.tools?.web?.search;
          if (search?.provider) {
            setSearchProvider(search.provider);
          }

          // Check which providers have keys configured
          const configured = { ...searchConfigured };
          if (search?.apiKey) {
            configured.brave = true;
          }
          if (search?.gemini?.apiKey) {
            configured.gemini = true;
          }
          if (search?.grok?.apiKey) {
            configured.grok = true;
          }
          if (search?.kimi?.apiKey) {
            configured.kimi = true;
          }
          if (search?.perplexity?.apiKey) {
            configured.perplexity = true;
          }
          setSearchConfigured(configured);

          // Firecrawl
          const firecrawl = cfg?.tools?.web?.fetch?.firecrawl;
          if (firecrawl?.apiKey) {
            setFirecrawlConfigured(true);
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

  async function handleSearchTest() {
    const key = searchKeys[searchProvider];
    if (!key.trim()) {
      return;
    }
    setSearchTesting(true);
    setSearchTestResult("idle");
    setSearchTestError(null);
    try {
      const res = await gatewayRpc<{ ok: boolean; error?: string }>("tools.search.test", {
        provider: searchProvider,
        apiKey: key.trim(),
      });
      if (res.ok && res.payload?.ok) {
        setSearchTestResult("success");
      } else {
        setSearchTestResult("error");
        setSearchTestError(res.ok ? (res.payload?.error ?? null) : (res.error ?? null));
      }
    } catch {
      setSearchTestResult("error");
      setSearchTestError("Connection failed");
    }
    setSearchTesting(false);
  }

  async function handleSearchSave() {
    const key = searchKeys[searchProvider];
    if (!key.trim()) {
      return;
    }
    setSearchSaving(true);
    setSearchSaved(false);
    try {
      const patch = buildSearchPatch(searchProvider, key.trim());
      const res = await saveConfigPatch(patch);
      if (res.ok) {
        setSearchSaved(true);
        setSearchConfigured((prev) => ({ ...prev, [searchProvider]: true }));
      } else {
        notifyError("Failed to save", new Error(res.error));
      }
    } catch (err) {
      notifyError("Failed to save", err instanceof Error ? err : new Error(String(err)));
    }
    setSearchSaving(false);
  }

  async function handleFirecrawlTest() {
    if (!firecrawlKey.trim()) {
      return;
    }
    setFirecrawlTesting(true);
    setFirecrawlTestResult("idle");
    setFirecrawlTestError(null);
    try {
      const res = await gatewayRpc<{ ok: boolean; error?: string }>("tools.fetch.test", {
        apiKey: firecrawlKey.trim(),
      });
      if (res.ok && res.payload?.ok) {
        setFirecrawlTestResult("success");
      } else {
        setFirecrawlTestResult("error");
        setFirecrawlTestError(res.ok ? (res.payload?.error ?? null) : (res.error ?? null));
      }
    } catch {
      setFirecrawlTestResult("error");
      setFirecrawlTestError("Connection failed");
    }
    setFirecrawlTesting(false);
  }

  async function handleFirecrawlSave() {
    if (!firecrawlKey.trim()) {
      return;
    }
    setFirecrawlSaving(true);
    setFirecrawlSaved(false);
    try {
      const res = await saveConfigPatch({
        tools: { web: { fetch: { firecrawl: { apiKey: firecrawlKey.trim(), enabled: true } } } },
      });
      if (res.ok) {
        setFirecrawlSaved(true);
        setFirecrawlConfigured(true);
      } else {
        notifyError("Failed to save", new Error(res.error));
      }
    } catch (err) {
      notifyError("Failed to save", err instanceof Error ? err : new Error(String(err)));
    }
    setFirecrawlSaving(false);
  }

  const currentProviderDef = SEARCH_PROVIDERS.find((p) => p.id === searchProvider)!;

  if (!loaded) {
    return null;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-orange-400" />
            {t("title", "Tools")}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {t("subtitle", "Configure API keys for web search and web fetch tools")}
          </p>
        </div>
        <DataModeSelector />
      </div>

      {/* Web Search Section */}
      <div className="rounded-2xl glass-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setSearchExpanded(!searchExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-[var(--glass-subtle-hover)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-900/30 flex items-center justify-center">
              <Search className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-neutral-100">
                {t("webSearch.title", "Web Search")}
              </h3>
              <p className="text-[11px] text-neutral-500">
                {t(
                  "webSearch.subtitle",
                  "Enable your AI assistant to search the web for current information",
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {searchConfigured[searchProvider] && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50">
                {t("webSearch.configured", "Configured")}
              </span>
            )}
            {searchExpanded ? (
              <ChevronUp className="w-4 h-4 text-neutral-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-500" />
            )}
          </div>
        </button>

        {searchExpanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-[var(--glass-border)]">
            {/* Provider selector */}
            <div className="pt-4">
              <label className="text-[11px] text-neutral-400 block mb-1">
                {t("webSearch.provider", "Search Provider")}
              </label>
              <select
                value={searchProvider}
                onChange={(e) => {
                  setSearchProvider(e.target.value as SearchProvider);
                  setSearchTestResult("idle");
                  setSearchSaved(false);
                }}
                disabled={demoMode}
                className="w-full h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 focus:border-orange-500 focus:outline-none"
              >
                {SEARCH_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {searchConfigured[p.id] ? " (configured)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* API key input */}
            <div>
              <label className="text-[11px] text-neutral-400 block mb-1">
                {t("webSearch.apiKey", "API Key")}
              </label>
              <PasswordInput
                value={searchKeys[searchProvider]}
                onChange={(v) => {
                  setSearchKeys((prev) => ({ ...prev, [searchProvider]: v }));
                  setSearchSaved(false);
                  setSearchTestResult("idle");
                }}
                placeholder={currentProviderDef.placeholder}
                disabled={demoMode}
              />
            </div>

            {/* Get API key link */}
            <a
              href={currentProviderDef.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t("webSearch.getKey", "Get API Key")}: {currentProviderDef.keyUrlLabel}
            </a>

            {/* Security note */}
            <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Shield className="w-3 h-3 flex-shrink-0" />
              API key is stored locally and never sent to third parties.
            </p>

            {/* Test + Save buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={handleSearchTest}
                disabled={!searchKeys[searchProvider].trim() || searchTesting || demoMode}
              >
                {searchTesting ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {t("webSearch.testing", "Testing...")}
                  </>
                ) : (
                  t("webSearch.test", "Test")
                )}
              </Button>

              <Button
                size="sm"
                className="text-xs"
                onClick={handleSearchSave}
                disabled={!searchKeys[searchProvider].trim() || searchSaving || demoMode}
              >
                {searchSaving ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : searchSaved ? (
                  <Check className="w-3 h-3 mr-1" />
                ) : null}
                {searchSaved ? t("webSearch.saved", "Saved") : t("webSearch.save", "Save")}
              </Button>

              {searchTestResult === "success" && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t("webSearch.testSuccess", "Search working")}
                </span>
              )}
              {searchTestResult === "error" && (
                <span className="text-xs text-red-400">
                  {searchTestError ?? t("webSearch.testFailed", "Search failed")}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Firecrawl Section */}
      <div className="rounded-2xl glass-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setFirecrawlExpanded(!firecrawlExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-[var(--glass-subtle-hover)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-900/30 flex items-center justify-center">
              <Wrench className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-neutral-100">
                {t("firecrawl.title", "Firecrawl")}
              </h3>
              <p className="text-[11px] text-neutral-500">
                {t("firecrawl.subtitle", "Optional. Enhances web page extraction quality.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {firecrawlConfigured && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50">
                {t("webSearch.configured", "Configured")}
              </span>
            )}
            {firecrawlExpanded ? (
              <ChevronUp className="w-4 h-4 text-neutral-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-neutral-500" />
            )}
          </div>
        </button>

        {firecrawlExpanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-[var(--glass-border)]">
            <div className="pt-4">
              <label className="text-[11px] text-neutral-400 block mb-1">
                {t("firecrawl.apiKey", "Firecrawl API Key")}
              </label>
              <PasswordInput
                value={firecrawlKey}
                onChange={(v) => {
                  setFirecrawlKey(v);
                  setFirecrawlSaved(false);
                  setFirecrawlTestResult("idle");
                }}
                placeholder="fc-xxxxxxxxxxxxx"
                disabled={demoMode}
              />
            </div>

            <a
              href="https://www.firecrawl.dev/app/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t("webSearch.getKey", "Get API Key")}: firecrawl.dev
            </a>

            <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Shield className="w-3 h-3 flex-shrink-0" />
              API key is stored locally and never sent to third parties.
            </p>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={handleFirecrawlTest}
                disabled={!firecrawlKey.trim() || firecrawlTesting || demoMode}
              >
                {firecrawlTesting ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {t("webSearch.testing", "Testing...")}
                  </>
                ) : (
                  t("webSearch.test", "Test")
                )}
              </Button>

              <Button
                size="sm"
                className="text-xs"
                onClick={handleFirecrawlSave}
                disabled={!firecrawlKey.trim() || firecrawlSaving || demoMode}
              >
                {firecrawlSaving ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : firecrawlSaved ? (
                  <Check className="w-3 h-3 mr-1" />
                ) : null}
                {firecrawlSaved ? t("firecrawl.saved", "Saved") : t("webSearch.save", "Save")}
              </Button>

              {firecrawlTestResult === "success" && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t("webSearch.testSuccess", "Working")}
                </span>
              )}
              {firecrawlTestResult === "error" && (
                <span className="text-xs text-red-400">
                  {firecrawlTestError ?? t("webSearch.testFailed", "Failed")}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
