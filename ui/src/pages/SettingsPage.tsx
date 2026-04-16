import { Loader2, RotateCcw, Settings, ExternalLink, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { syncAllDemoMode, DataModeSelector } from "@/components/DataModeSelector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { saveConfigPatch } from "@/lib/save-config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { notifyError } from "@/stores/notification-store";
import { useThemeStore, THEMES, type ThemeId } from "@/stores/theme-store";
import { useTradingStore } from "@/stores/trading-store";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEMO_DEFAULTS = {
  port: 18789,
  authMode: "none" as const,
  assistantName: "Assistant",
  persona: "jarvis",
  thinkingMode: "medium",
  typingMode: "thinking",
};

const THINKING_OPTIONS = ["off", "minimal", "low", "medium", "high", "adaptive"] as const;
const TYPING_OPTIONS = ["never", "instant", "thinking", "message"] as const;
const AUTH_OPTIONS = ["none", "token", "password"] as const;

// ---------------------------------------------------------------------------
// Shared sections (moved from TradingSettingsPage)
// ---------------------------------------------------------------------------

function SetupWizardSection() {
  const { t: ts } = useTranslation("settings");
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1">{ts("setupWizard")}</h3>
      <p className="text-xs text-neutral-500 mb-3">{ts("setupWizardDesc")}</p>
      <button
        type="button"
        onClick={() => {
          setOnboardingComplete(false);
          void navigate("/");
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all cursor-pointer"
      >
        <RotateCcw className="w-3 h-3" />
        {ts("rerunWizard")}
      </button>
    </div>
  );
}

function ThemeSelector() {
  const { t: ts } = useTranslation("settings");
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">{ts("appearance")}</h3>
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][]).map(([id, _info]) => (
          <button
            key={id}
            onClick={() => setTheme(id)}
            className={cn(
              "rounded-xl border p-4 text-left transition-all duration-300 cursor-pointer group",
              theme === id
                ? "border-orange-600 bg-orange-950/30 shadow-lg shadow-orange-900/20"
                : "border-[var(--glass-border)] bg-[var(--glass-subtle)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-subtle-hover)]",
            )}
          >
            {/* Color preview strip */}
            <div
              className="h-2 rounded-full mb-3 transition-all duration-300"
              style={{
                background:
                  id === "tiger-gold"
                    ? "linear-gradient(90deg, #d4850a, #e8a020, #f5c842, #8b4513)"
                    : "linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6, #475569)",
              }}
            />
            <div className="text-sm font-semibold text-neutral-200">
              {ts(id === "tiger-gold" ? "tigerGold" : "midnightSteel")}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              {ts(id === "tiger-gold" ? "tigerGoldDesc" : "midnightSteelDesc")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsDataModeSelector() {
  const { t: ts } = useTranslation("settings");
  const demoMode = useTradingStore((s) => s.demoMode);
  const [confirmLive, setConfirmLive] = useState(false);

  function handleSelect(mode: "demo" | "live") {
    if (mode === "demo" && !demoMode) {
      syncAllDemoMode(true);
    } else if (mode === "live" && demoMode) {
      setConfirmLive(true);
    }
  }

  return (
    <>
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">{ts("dataSource")}</h3>
        <p className="text-[11px] text-neutral-500 mb-3">
          {demoMode ? ts("demoModeDesc") : ts("liveModeDesc")}
        </p>

        {/* Segmented control */}
        <div className="flex rounded-lg border border-[var(--glass-border)] overflow-hidden">
          <button
            onClick={() => handleSelect("demo")}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer",
              demoMode
                ? "bg-amber-600/80 text-white"
                : "bg-[var(--glass-subtle)] text-neutral-500 hover:text-neutral-300 hover:bg-[var(--glass-subtle-hover)]",
            )}
          >
            {ts("demoLabel")}
          </button>
          <button
            onClick={() => handleSelect("live")}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer border-l border-[var(--glass-border)]",
              !demoMode
                ? "bg-green-600/80 text-white"
                : "bg-[var(--glass-subtle)] text-neutral-500 hover:text-neutral-300 hover:bg-[var(--glass-subtle-hover)]",
            )}
          >
            {ts("liveLabel")}
          </button>
        </div>
      </div>

      <AlertDialog open={confirmLive} onOpenChange={setConfirmLive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ts("switchToLiveTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-neutral-400">
                <p>{ts("switchToLiveDesc")}</p>
                <p>{ts("startInstructions")}</p>
                <code className="block rounded-lg bg-[var(--glass-input-bg)] border border-[var(--glass-border)] px-3 py-2 text-xs font-mono text-neutral-300">
                  tigerpaw start
                </code>
                <p className="text-xs text-neutral-500">{ts("serverNotRunningNote")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ts("stayOnDemo")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-700 hover:bg-green-600 text-white"
              onClick={() => {
                syncAllDemoMode(false);
                setConfirmLive(false);
              }}
            >
              {ts("switchToLive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type RemoteAccessMode = "local" | "tailscale" | "cloudflare";

function RemoteAccessSection() {
  const { t: ts } = useTranslation("settings");
  const [mode, setMode] = useState<RemoteAccessMode>("local");
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const configPatch = useMemo(() => {
    if (mode === "local") {
      return { gateway: { bind: "loopback", tailscale: { mode: "off" } } };
    }
    if (mode === "tailscale") {
      return {
        gateway: {
          bind: "tailnet",
          tailscale: { mode: "serve" },
          auth: { mode: "token" },
        },
      };
    }
    // cloudflare
    const patch: Record<string, unknown> = {
      gateway: {
        bind: "loopback",
        tailscale: { mode: "off" },
        auth: { mode: "token" },
      },
    };
    if (tunnelUrl.trim()) {
      (patch.gateway as Record<string, unknown>).controlUi = {
        allowedOrigins: [tunnelUrl.trim()],
      };
    }
    return patch;
  }, [mode, tunnelUrl]);

  async function handleSave() {
    setSaveStatus("saving");
    setSaveError(null);
    const result = await saveConfigPatch(configPatch);
    if (result.ok) {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 4000);
    } else {
      setSaveStatus("error");
      setSaveError(result.error);
    }
  }

  return (
    <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1">{ts("remoteAccess")}</h3>
      <p className="text-[11px] text-neutral-500 mb-3">{ts("remoteAccessDesc")}</p>

      <div className="space-y-2">
        {/* Local Only */}
        <label
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-300",
            mode === "local"
              ? "border-orange-600 bg-orange-950/20"
              : "border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-divider)]",
          )}
        >
          <input
            type="radio"
            name="remoteAccess"
            checked={mode === "local"}
            onChange={() => setMode("local")}
            className="mt-0.5 accent-orange-500"
          />
          <div>
            <div className="text-sm font-medium text-neutral-200">
              {ts("localOnly")}{" "}
              <span className="text-[10px] text-green-400 font-normal ml-1">
                {ts("mostSecure")}
              </span>
            </div>
            <div className="text-xs text-neutral-500">{ts("localOnlyDesc")}</div>
          </div>
        </label>

        {/* Tailscale */}
        <label
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-300",
            mode === "tailscale"
              ? "border-orange-600 bg-orange-950/20"
              : "border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-divider)]",
          )}
        >
          <input
            type="radio"
            name="remoteAccess"
            checked={mode === "tailscale"}
            onChange={() => setMode("tailscale")}
            className="mt-0.5 accent-orange-500"
          />
          <div>
            <div className="text-sm font-medium text-neutral-200">
              {ts("tailscale")}{" "}
              <span className="text-[10px] text-blue-400 font-normal ml-1">
                {ts("e2eEncrypted")}
              </span>
            </div>
            <div className="text-xs text-neutral-500">{ts("tailscaleAccessDesc")}</div>
          </div>
        </label>

        {/* Cloudflare Tunnel */}
        <label
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-300",
            mode === "cloudflare"
              ? "border-orange-600 bg-orange-950/20"
              : "border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-divider)]",
          )}
        >
          <input
            type="radio"
            name="remoteAccess"
            checked={mode === "cloudflare"}
            onChange={() => setMode("cloudflare")}
            className="mt-0.5 accent-orange-500"
          />
          <div>
            <div className="text-sm font-medium text-neutral-200">
              {ts("cloudflare")}{" "}
              <span className="text-[10px] text-amber-400 font-normal ml-1">
                {ts("easiestSetup")}
              </span>
            </div>
            <div className="text-xs text-neutral-500">{ts("cloudflareAccessDesc")}</div>
          </div>
        </label>
      </div>

      {/* Security warning for non-local modes */}
      {mode !== "local" && (
        <div className="mt-3 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-xs">
          <div className="font-semibold text-amber-400 mb-2">{ts("staysOnMachine")}</div>
          <ul className="space-y-1 text-neutral-400 mb-3">
            <li className="flex items-center gap-1.5">
              <span className="text-green-400">✓</span> {ts("apiKeysLocal")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-green-400">✓</span> {ts("auditLogsLocal")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-green-400">✓</span> {ts("orderExecLocal")}
            </li>
          </ul>
          <div className="font-semibold text-amber-400 mb-2">{ts("remotelyViewable")}</div>
          <ul className="space-y-1 text-neutral-400">
            <li className="flex items-center gap-1.5">
              <span className="text-amber-400">→</span> {ts("dashboardRemote")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-amber-400">→</span> {ts("killSwitchRemote")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-amber-400">→</span> {ts("approvalQueueRemote")}
            </li>
          </ul>
        </div>
      )}

      {/* Tailscale-specific instructions */}
      {mode === "tailscale" && (
        <div className="mt-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-input-bg)] p-3 text-xs space-y-2">
          <div className="font-medium text-neutral-300">{ts("setup")}</div>
          <ol className="space-y-1.5 text-neutral-400 list-decimal list-inside">
            <li>{ts("tailscaleStep1")}</li>
            <li>{ts("tailscaleStep2")}</li>
            <li>{ts("tailscaleStep3")}</li>
            <li>{ts("tailscaleStep4")}</li>
          </ol>
          <p className="text-[10px] text-neutral-500 mt-2">{ts("tailscaleNote")}</p>
        </div>
      )}

      {/* Cloudflare-specific instructions */}
      {mode === "cloudflare" && (
        <div className="mt-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-input-bg)] p-3 text-xs space-y-2">
          <div className="font-medium text-neutral-300">{ts("setup")}</div>
          <ol className="space-y-1.5 text-neutral-400 list-decimal list-inside">
            <li>{ts("cloudflareSetupStep1")}</li>
            <li>{ts("cloudflareSetupStep2")}</li>
            <li>{ts("cloudflareSetupStep3")}</li>
          </ol>
          <div className="mt-2">
            <label className="text-[10px] text-neutral-500 block mb-1">{ts("tunnelUrl")}</label>
            <input
              type="text"
              value={tunnelUrl}
              onChange={(e) => setTunnelUrl(e.target.value)}
              placeholder="https://your-tunnel.cfargotunnel.com"
              className="w-full bg-[var(--glass-input-bg)] border border-[var(--glass-border)] rounded px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <p className="text-[10px] text-amber-500 mt-1">{ts("cloudflareWarning")}</p>
        </div>
      )}

      {/* Save button */}
      {mode !== "local" && (
        <div className="mt-3">
          <button
            onClick={handleSave}
            disabled={saveStatus === "saving" || (mode === "cloudflare" && !tunnelUrl.trim())}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-semibold cursor-pointer transition-all duration-300",
              saveStatus === "saved"
                ? "bg-green-700 text-white"
                : "bg-orange-600 hover:bg-orange-500 text-white hover:shadow-lg hover:shadow-orange-900/30",
              (saveStatus === "saving" || (mode === "cloudflare" && !tunnelUrl.trim())) &&
                "opacity-50 cursor-not-allowed",
            )}
          >
            {saveStatus === "saving"
              ? ts("saving")
              : saveStatus === "saved"
                ? ts("savedRestart")
                : ts("saveRestart")}
          </button>
          {saveStatus === "error" && saveError && (
            <p className="text-xs text-red-400 mt-1.5">{saveError}</p>
          )}
          {saveStatus === "error" && !saveError && (
            <p className="text-xs text-red-400 mt-1.5">{ts("gatewayNotReachable")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { t } = useTranslation("config");
  const demoMode = useTradingStore((s) => s.demoMode);

  // Form state
  const [port, setPort] = useState(DEMO_DEFAULTS.port);
  const [authMode, setAuthMode] = useState<string>(DEMO_DEFAULTS.authMode);
  const [assistantName, setAssistantName] = useState(DEMO_DEFAULTS.assistantName);
  const [persona, setPersona] = useState(DEMO_DEFAULTS.persona);
  const [thinkingMode, setThinkingMode] = useState(DEMO_DEFAULTS.thinkingMode);
  const [typingMode, setTypingMode] = useState(DEMO_DEFAULTS.typingMode);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!demoMode);
  const [restartState, setRestartState] = useState<"idle" | "confirming" | "restarting" | "done">(
    "idle",
  );
  const [resetConfirming, setResetConfirming] = useState(false);
  const [assistantNameDirty, setAssistantNameDirty] = useState(false);

  // Load config on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await gatewayRpc<{ raw?: string }>("config.get", {});
        if (cancelled) {
          return;
        }
        if (res.ok && res.payload?.raw) {
          const cfg = JSON.parse(res.payload.raw);
          setIsLive(true);
          if (cfg?.gateway?.port) {
            setPort(cfg.gateway.port);
          }
          if (cfg?.gateway?.auth?.mode) {
            setAuthMode(cfg.gateway.auth.mode);
          }
          const uiAssistant = cfg?.ui?.assistant;
          if (uiAssistant?.name) {
            setAssistantName(uiAssistant.name);
          }
          const agentDefaults = cfg?.agents?.defaults;
          if (agentDefaults?.thinkingDefault) {
            setThinkingMode(agentDefaults.thinkingDefault);
          }
          if (agentDefaults?.typingMode) {
            setTypingMode(agentDefaults.typingMode);
          }
          const assistantCfg = cfg?.assistant;
          if (assistantCfg?.persona) {
            setPersona(assistantCfg.persona);
          }
        }
      } catch {
        // Gateway offline
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const patch: Record<string, unknown> = {
      gateway: { port, auth: { mode: authMode } },
      agents: { defaults: { thinkingDefault: thinkingMode, typingMode } },
    };
    // Only include assistant name if the user explicitly changed it (prevents race with config load)
    if (assistantNameDirty) {
      patch.ui = { assistant: { name: assistantName } };
    }
    const res = await saveConfigPatch(patch);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      notifyError(t("saveFailed", "Failed to save configuration"), res);
    }
    setSaving(false);
  }

  async function handleRestart() {
    setRestartState("restarting");
    try {
      await gatewayRpc("gateway.restart", {});
      // Wait for gateway to go down and come back
      await new Promise((r) => setTimeout(r, 3000));
      // Poll for reconnection
      for (let i = 0; i < 10; i++) {
        try {
          const res = await gatewayRpc("health", {});
          if (res.ok) {
            setRestartState("done");
            setTimeout(() => setRestartState("idle"), 3000);
            return;
          }
        } catch {
          // Still restarting
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setRestartState("idle");
    } catch {
      setRestartState("idle");
      notifyError("Gateway restart failed", null);
    }
  }

  async function handleResetOnboarding() {
    try {
      await gatewayRpc("onboarding.reset", {});
      window.location.reload();
    } catch (err) {
      notifyError("Failed to reset onboarding", err);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
      </div>
    );
  }

  const inputClass =
    "w-full sm:w-64 h-9 rounded-md border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-3 text-sm text-neutral-200 focus:border-orange-500 focus:outline-none transition-colors";
  const selectClass = cn(inputClass, "cursor-pointer");
  const disabled = demoMode && !isLive;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-400" />
            {t("general.title", "Settings")}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {t("general.subtitle", "General application settings for Tigerpaw")}
          </p>
        </div>
        <DataModeSelector />
      </div>

      {/* Demo notice */}
      {disabled && (
        <div className="rounded-xl bg-amber-900/20 border border-amber-800/30 px-4 py-2.5 text-xs text-amber-400">
          {t("general.demoNotice", "Connect to the gateway to edit live settings")}
        </div>
      )}

      {/* Gateway Section */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">
          {t("general.gateway", "Gateway")}
        </h3>
        <p className="text-[11px] text-neutral-500 mb-4">
          {t("general.gatewayDesc", "Network and authentication settings")}
        </p>

        <div className="space-y-4">
          {/* Port */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs text-neutral-300">{t("general.port", "Port")}</div>
              <div className="text-[11px] text-neutral-500">
                {t("general.portDesc", "Gateway port (default: 18789)")}
              </div>
            </div>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              disabled={disabled}
              min={1}
              max={65535}
              className={cn(inputClass, "w-28 sm:w-28 text-right font-mono")}
            />
          </div>

          {/* Auth Mode */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs text-neutral-300">{t("general.authMode", "Auth Mode")}</div>
            </div>
            <select
              value={authMode}
              onChange={(e) => setAuthMode(e.target.value)}
              disabled={disabled}
              className={selectClass}
              style={{ width: "7rem" }}
            >
              {AUTH_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`general.auth${opt.charAt(0).toUpperCase() + opt.slice(1)}`, opt)}
                </option>
              ))}
            </select>
          </div>

          {/* Restart Gateway */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[var(--glass-border)]">
            <div>
              <div className="text-xs text-neutral-300">
                {t("general.restart", "Restart Gateway")}
              </div>
              <div className="text-[11px] text-neutral-500">
                {t("general.restartWarning", "Port or auth changes require a gateway restart")}
              </div>
            </div>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => setRestartState("confirming")}
              disabled={disabled || restartState === "restarting"}
            >
              {restartState === "restarting" ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  {t("general.restarting", "Restarting...")}
                </>
              ) : restartState === "done" ? (
                <span className="text-green-400">
                  {t("general.restarted", "Gateway restarted")}
                </span>
              ) : (
                <>
                  <RotateCcw className="w-3 h-3 mr-1.5" />
                  {t("general.restart", "Restart Gateway")}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Restart Confirmation Dialog */}
      <AlertDialog
        open={restartState === "confirming"}
        onOpenChange={(open) => !open && setRestartState("idle")}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("general.restartConfirmTitle", "Restart Gateway?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "general.restartConfirm",
                "This will restart the gateway. Active connections will briefly disconnect.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestart}>
              {t("general.restart", "Restart Gateway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assistant Section */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">
          {t("general.assistant", "Assistant")}
        </h3>
        <p className="text-[11px] text-neutral-500 mb-4">
          {t("general.assistantDesc", "Display name for the AI assistant")}
        </p>

        <div className="space-y-4">
          {/* Name */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-neutral-300">
              {t("general.assistantName", "Assistant Name")}
            </div>
            <input
              type="text"
              value={assistantName}
              onChange={(e) => {
                setAssistantName(e.target.value);
                setAssistantNameDirty(true);
              }}
              disabled={disabled}
              maxLength={50}
              className={cn(inputClass, "sm:w-48")}
            />
          </div>

          {/* Persona (read-only) */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-neutral-300">{t("general.persona", "Persona")}</div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-orange-900/30 text-orange-400 border border-orange-800/40">
              {persona}
            </span>
          </div>
        </div>
      </div>

      {/* AI Defaults Section */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">
          {t("general.aiDefaults", "AI Defaults")}
        </h3>
        <p className="text-[11px] text-neutral-500 mb-4">
          {t("general.aiDefaultsDesc", "Default behavior for AI sessions")}
        </p>

        <div className="space-y-4">
          {/* Thinking Mode */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-neutral-300">
              {t("general.thinkingMode", "Thinking Mode")}
            </div>
            <select
              value={thinkingMode}
              onChange={(e) => setThinkingMode(e.target.value)}
              disabled={disabled}
              className={selectClass}
              style={{ width: "9rem" }}
            >
              {THINKING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Typing Mode */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-neutral-300">
              {t("general.typingMode", "Typing Indicator")}
            </div>
            <select
              value={typingMode}
              onChange={(e) => setTypingMode(e.target.value)}
              disabled={disabled}
              className={selectClass}
              style={{ width: "9rem" }}
            >
              {TYPING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Setup Wizard */}
      <SetupWizardSection />

      {/* Appearance */}
      <ThemeSelector />

      {/* Data Source */}
      <SettingsDataModeSelector />

      {/* Remote Dashboard Access */}
      <RemoteAccessSection />

      {/* Save Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={disabled || saving} className="px-6">
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              {t("general.saving", "Saving...")}
            </>
          ) : saved ? (
            <span className="text-green-400">{t("general.saved", "Settings saved")}</span>
          ) : (
            t("general.saveChanges", "Save Changes")
          )}
        </Button>
        <Link
          to="/config"
          className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {t("general.advancedConfig", "Advanced: Edit Raw Config")}
        </Link>
      </div>

      {/* Danger Zone */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300 border-red-900/30">
        <h3 className="text-sm font-semibold text-red-400 mb-1">
          {t("general.dangerZone", "Danger Zone")}
        </h3>
        <p className="text-[11px] text-red-400/70 mb-3 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {t(
            "general.resetWarning",
            "This will DELETE all AI provider keys, messaging channel connections, and OAuth tokens. The gateway will restart. This cannot be undone.",
          )}
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="text-xs bg-red-700 hover:bg-red-600"
          onClick={() => setResetConfirming(true)}
          disabled={disabled}
        >
          <RotateCcw className="w-3 h-3 mr-1.5" />
          {t("general.resetOnboarding", "Reset Onboarding")}
        </Button>
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog
        open={resetConfirming}
        onOpenChange={(open) => !open && setResetConfirming(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("general.resetConfirmTitle", "Reset Onboarding?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "general.resetWarning",
                "This will DELETE all AI provider keys, messaging channel connections, and OAuth tokens. The gateway will restart. This cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetOnboarding}
              className="bg-red-700 hover:bg-red-600"
            >
              {t("general.resetOnboarding", "Reset Onboarding")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
