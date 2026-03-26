import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
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
import { saveConfigPatch } from "@/lib/save-config";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/stores/notification-store";
import { useThemeStore, THEMES, type ThemeId } from "@/stores/theme-store";
import {
  useTradingStore,
  type RiskTier,
  type ApprovalMode,
  type PerPlatformOverride,
  type PolicyLimits,
} from "@/stores/trading-store";

const TIER_PRESETS: Record<Exclude<RiskTier, "custom">, { labelKey: string; descKey: string }> = {
  conservative: { labelKey: "conservative", descKey: "conservativeDesc" },
  moderate: { labelKey: "moderate", descKey: "moderateDesc" },
  aggressive: { labelKey: "aggressive", descKey: "aggressiveDesc" },
};

const APPROVAL_MODES: { value: ApprovalMode; labelKey: string; descKey: string }[] = [
  { value: "auto", labelKey: "auto", descKey: "autoDesc" },
  { value: "confirm", labelKey: "confirmMode", descKey: "confirmDesc" },
  { value: "manual", labelKey: "manual", descKey: "manualDesc" },
];

const TIMEOUT_OPTIONS = [
  { value: 10_000, label: "10s" },
  { value: 15_000, label: "15s" },
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "1m" },
  { value: 120_000, label: "2m" },
  { value: 300_000, label: "5m" },
  { value: 600_000, label: "10m" },
];

function LimitInput({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <label className="text-xs text-neutral-400">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 bg-[var(--glass-input-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-xs text-neutral-200 font-mono text-right focus:border-orange-500 focus:outline-none"
        />
        <span className="text-xs text-neutral-500 w-16">{unit}</span>
      </div>
    </div>
  );
}

function PlatformOverrideSection({
  platformId,
  label,
  platformType,
  currencyLabel,
  override,
  globalLimits,
  onUpdate,
  onClear,
}: {
  platformId: string;
  label: string;
  platformType: string;
  currencyLabel: string;
  override?: PerPlatformOverride;
  globalLimits: PolicyLimits;
  onUpdate: (id: string, o: PerPlatformOverride) => void;
  onClear: (id: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [expanded, setExpanded] = useState(false);
  const hasOverrides = override && Object.keys(override).length > 0;

  const typeLabel =
    platformType === "prediction"
      ? t("prediction")
      : platformType === "play_money"
        ? t("playMoney")
        : platformType === "perpetuals"
          ? t("perpetuals")
          : platformType === "multi_asset"
            ? t("multiAsset")
            : platformType === "crypto"
              ? t("crypto")
              : t("stocks");

  const typeBadgeColor =
    platformType === "prediction"
      ? "bg-amber-900/50 text-amber-400 border-amber-800/50"
      : platformType === "play_money"
        ? "bg-blue-900/50 text-blue-400 border-blue-800/50"
        : platformType === "perpetuals"
          ? "bg-red-900/50 text-red-400 border-red-800/50"
          : "bg-neutral-800/50 text-neutral-400 border-neutral-700/50";

  const unitLabel = currencyLabel === "Mana" ? t("mana") : t("usd");

  return (
    <div className="border border-[var(--glass-border)] rounded-xl hover:border-[var(--glass-hover-strong)] transition-all duration-300">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--glass-divider)] transition-all duration-300 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-300">{label}</span>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", typeBadgeColor)}>
            {typeLabel}
          </span>
          {hasOverrides && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400 border border-orange-800/50">
              {t("custom")}
            </span>
          )}
        </div>
        <span className="text-[10px] text-neutral-500">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--glass-divider)]">
          {platformType === "prediction" && (
            <p className="text-[10px] text-amber-400/70 mt-2 mb-1">{t("predictionNote")}</p>
          )}
          {platformType === "play_money" && (
            <p className="text-[10px] text-blue-400/70 mt-2 mb-1">{t("playMoneyNote")}</p>
          )}
          {platformType === "perpetuals" && (
            <p className="text-[10px] text-red-400/70 mt-2 mb-1">{t("perpetualsNote")}</p>
          )}
          <p className="text-[10px] text-neutral-500 mt-2 mb-2">
            {t("overrideGlobalLimits")} {label}. {t("leaveBlankDefault")}
          </p>
          <LimitInput
            label={t("maxSingleTrade")}
            value={override?.maxSingleTradeUsd ?? globalLimits.maxSingleTradeUsd}
            unit={unitLabel}
            onChange={(v) => onUpdate(platformId, { ...override, maxSingleTradeUsd: v })}
          />
          <LimitInput
            label={t("maxDailySpend")}
            value={override?.maxDailySpendUsd ?? globalLimits.maxDailySpendUsd}
            unit={unitLabel}
            onChange={(v) => onUpdate(platformId, { ...override, maxDailySpendUsd: v })}
          />
          <LimitInput
            label={t("maxTradesDay")}
            value={override?.maxTradesPerDay ?? globalLimits.maxTradesPerDay}
            unit={t("trades")}
            onChange={(v) => onUpdate(platformId, { ...override, maxTradesPerDay: v })}
          />
          <LimitInput
            label={t("maxOpenPositions")}
            value={override?.maxOpenPositions ?? globalLimits.maxOpenPositions}
            unit={t("positionsUnit")}
            onChange={(v) => onUpdate(platformId, { ...override, maxOpenPositions: v })}
          />
          {hasOverrides && (
            <button
              onClick={() => onClear(platformId)}
              className="mt-2 text-[10px] text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              {t("clearOverrides")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DataModeSelector() {
  const { t: ts } = useTranslation("settings");
  const { demoMode, setDemoMode } = useTradingStore();
  const [confirmLive, setConfirmLive] = useState(false);

  function handleSelect(mode: "demo" | "live") {
    if (mode === "demo" && !demoMode) {
      setDemoMode(true);
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
                setDemoMode(false);
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

function LanguageSelector() {
  const { t } = useTranslation("settings");

  return (
    <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
      <h3 className="text-sm font-semibold text-neutral-300 mb-1">{t("language")}</h3>
      <p className="text-[11px] text-neutral-500">{t("languageDesc")}</p>
    </div>
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

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer shrink-0",
        enabled ? "bg-orange-600" : "bg-neutral-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
          enabled && "translate-x-5",
        )}
      />
    </button>
  );
}

function NotificationSettings() {
  const { t } = useTranslation("settings");
  const toastsEnabled = useNotificationStore((s) => s.toastsEnabled);
  const setToastsEnabled = useNotificationStore((s) => s.setToastsEnabled);
  const browserNotificationsEnabled = useNotificationStore((s) => s.browserNotificationsEnabled);
  const setBrowserNotifications = useNotificationStore((s) => s.setBrowserNotifications);
  const platformFilters = useNotificationStore((s) => s.platformFilters);
  const setPlatformFilter = useNotificationStore((s) => s.setPlatformFilter);
  const platforms = useTradingStore((s) => s.platforms);

  const handleBrowserToggle = (enabled: boolean) => {
    if (
      enabled &&
      typeof globalThis.Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().then((perm) => {
        setBrowserNotifications(perm === "granted");
      });
    } else {
      setBrowserNotifications(enabled);
    }
  };

  const allEnabled = Object.values(platformFilters).every(Boolean);

  return (
    <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">{t("notifications")}</h3>
      <div className="space-y-3">
        {/* Toast popups */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm text-neutral-200">{t("toastPopups")}</div>
            <div className="text-[11px] text-neutral-500">{t("toastPopupsDesc")}</div>
          </div>
          <ToggleSwitch enabled={toastsEnabled} onToggle={() => setToastsEnabled(!toastsEnabled)} />
        </label>

        {/* Browser notifications */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm text-neutral-200">{t("browserNotifications")}</div>
            <div className="text-[11px] text-neutral-500">{t("browserNotificationsDesc")}</div>
          </div>
          <ToggleSwitch
            enabled={browserNotificationsEnabled}
            onToggle={() => handleBrowserToggle(!browserNotificationsEnabled)}
          />
        </label>

        {/* Per-platform filters */}
        <div className="pt-2 border-t border-[var(--glass-divider)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-neutral-400">{t("notifyByPlatform")}</div>
            <button
              onClick={() => {
                const newVal = !allEnabled;
                for (const id of Object.keys(platformFilters)) {
                  setPlatformFilter(id, newVal);
                }
              }}
              className="text-[10px] text-orange-500/70 hover:text-orange-400 transition-colors cursor-pointer"
            >
              {allEnabled ? t("disableAll") : t("enableAll")}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(platforms).map(([id, p]) => {
              const enabled = platformFilters[id] !== false;
              return (
                <button
                  key={id}
                  onClick={() => setPlatformFilter(id, !enabled)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all duration-200 cursor-pointer border",
                    enabled
                      ? "border-orange-600/40 bg-orange-950/20 text-neutral-200"
                      : "border-[var(--glass-border)] bg-[var(--glass-divider)] text-neutral-500",
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
                      enabled ? "bg-orange-500" : "bg-neutral-600",
                    )}
                  />
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-neutral-600 mt-2">{t("globalEventsNote")}</div>
        </div>

        {/* Info */}
        <div className="text-[10px] text-neutral-600 pt-1 border-t border-[var(--glass-divider)]">
          {t("notificationLimitNote")}
        </div>
      </div>
    </div>
  );
}

export function TradingSettingsPage() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const {
    tier,
    approvalMode,
    limits,
    confirmTimeoutMs,
    confirmTimeoutAction,
    manualTimeoutMs,
    manualTimeoutAction,
    platforms,
    perPlatformOverrides,
    setPolicy,
    setPlatformOverride,
    clearPlatformOverride,
  } = useTradingStore();

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">{t("title")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Configure risk limits and approval behavior
          </p>
        </div>
        <NavLink
          to="/trading"
          className="text-xs text-neutral-400 hover:text-neutral-200 px-3 py-1.5 rounded-md border border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-input-bg)] transition-all duration-300 cursor-pointer"
        >
          ← Back to Trading
        </NavLink>
      </div>

      {/* Appearance */}
      <ThemeSelector />

      {/* Language */}
      <LanguageSelector />

      {/* Data Source */}
      <DataModeSelector />

      {/* Remote Dashboard Access */}
      <RemoteAccessSection />

      {/* Notifications */}
      <NotificationSettings />

      {/* Risk Tier */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">{t("riskTier")}</h3>
        <div className="grid grid-cols-3 gap-2">
          {(
            Object.entries(TIER_PRESETS) as [
              Exclude<RiskTier, "custom">,
              typeof TIER_PRESETS.conservative,
            ][]
          ).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setPolicy({ tier: key })}
              className={cn(
                "rounded-md border p-3 text-left transition-all duration-300 cursor-pointer",
                tier === key
                  ? "border-orange-600 bg-orange-950/30"
                  : "border-[var(--glass-border)] bg-[var(--glass-divider)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-subtle-hover)]",
              )}
            >
              <div className="text-sm font-medium text-neutral-200">{t(preset.labelKey)}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">{t(preset.descKey)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Approval Mode */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">{t("approvalMode")}</h3>
        <div className="space-y-2">
          {APPROVAL_MODES.map((mode) => (
            <label
              key={mode.value}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-all duration-300",
                approvalMode === mode.value
                  ? "border-orange-600 bg-orange-950/20"
                  : "border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-divider)]",
              )}
            >
              <input
                type="radio"
                name="approvalMode"
                value={mode.value}
                checked={approvalMode === mode.value}
                onChange={() => setPolicy({ approvalMode: mode.value })}
                className="mt-0.5 accent-orange-500"
              />
              <div>
                <div className="text-sm font-medium text-neutral-200">{t(mode.labelKey)}</div>
                <div className="text-xs text-neutral-500">{t(mode.descKey)}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Confirm mode settings */}
        {(approvalMode === "confirm" || approvalMode === "manual") && (
          <div className="mt-4 pt-3 border-t border-[var(--glass-divider)] space-y-4">
            {approvalMode === "confirm" && (
              <div>
                <div className="text-xs font-medium text-neutral-300 mb-2">
                  Confirm Mode Settings
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-300">Timeout</div>
                      <div className="text-[10px] text-neutral-500">
                        How long to wait for your response
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {TIMEOUT_OPTIONS.filter((o) => o.value <= 120_000).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPolicy({ confirmTimeoutMs: opt.value })}
                          className={cn(
                            "px-2 py-1 rounded text-[11px] font-mono transition-all duration-200 cursor-pointer border",
                            confirmTimeoutMs === opt.value
                              ? "border-orange-600 bg-orange-950/30 text-orange-300"
                              : "border-[var(--glass-border)] bg-[var(--glass-divider)] text-neutral-500 hover:text-neutral-300 hover:border-[var(--glass-border-hover-strong)]",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-300">If no response</div>
                      <div className="text-[10px] text-neutral-500">
                        What happens when the timeout expires
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPolicy({ confirmTimeoutAction: "deny" })}
                        className={cn(
                          "px-3 py-1 rounded text-[11px] font-semibold transition-all duration-200 cursor-pointer border",
                          confirmTimeoutAction === "deny"
                            ? "border-red-600 bg-red-950/30 text-red-300"
                            : "border-[var(--glass-border)] bg-[var(--glass-divider)] text-neutral-500 hover:text-neutral-300 hover:border-[var(--glass-border-hover-strong)]",
                        )}
                      >
                        Deny trade
                      </button>
                      <button
                        onClick={() => setPolicy({ confirmTimeoutAction: "approve" })}
                        className={cn(
                          "px-3 py-1 rounded text-[11px] font-semibold transition-all duration-200 cursor-pointer border",
                          confirmTimeoutAction === "approve"
                            ? "border-green-600 bg-green-950/30 text-green-300"
                            : "border-[var(--glass-border)] bg-[var(--glass-divider)] text-neutral-500 hover:text-neutral-300 hover:border-[var(--glass-border-hover-strong)]",
                        )}
                      >
                        Auto-approve
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {approvalMode === "manual" && (
              <div>
                <div className="text-xs font-medium text-neutral-300 mb-2">
                  Manual Mode Settings
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-300">Timeout</div>
                      <div className="text-[10px] text-neutral-500">
                        How long to wait for your approval
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {TIMEOUT_OPTIONS.filter((o) => o.value >= 60_000).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPolicy({ manualTimeoutMs: opt.value })}
                          className={cn(
                            "px-2 py-1 rounded text-[11px] font-mono transition-all duration-200 cursor-pointer border",
                            manualTimeoutMs === opt.value
                              ? "border-orange-600 bg-orange-950/30 text-orange-300"
                              : "border-[var(--glass-border)] bg-[var(--glass-divider)] text-neutral-500 hover:text-neutral-300 hover:border-[var(--glass-border-hover-strong)]",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-300">If no response</div>
                      <div className="text-[10px] text-neutral-500">
                        What happens when the timeout expires
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPolicy({ manualTimeoutAction: "deny" })}
                        className={cn(
                          "px-3 py-1 rounded text-[11px] font-semibold transition-all duration-200 cursor-pointer border",
                          manualTimeoutAction === "deny"
                            ? "border-red-600 bg-red-950/30 text-red-300"
                            : "border-[var(--glass-border)] bg-[var(--glass-divider)] text-neutral-500 hover:text-neutral-300 hover:border-[var(--glass-border-hover-strong)]",
                        )}
                      >
                        Deny trade
                      </button>
                      <button
                        onClick={() => setPolicy({ manualTimeoutAction: "approve" })}
                        className={cn(
                          "px-3 py-1 rounded text-[11px] font-semibold transition-all duration-200 cursor-pointer border",
                          manualTimeoutAction === "approve"
                            ? "border-green-600 bg-green-950/30 text-green-300"
                            : "border-[var(--glass-border)] bg-[var(--glass-divider)] text-neutral-500 hover:text-neutral-300 hover:border-[var(--glass-border-hover-strong)]",
                        )}
                      >
                        Auto-approve
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Per-Trade Limits */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">{t("tradingLimits")}</h3>
        <p className="text-[10px] text-neutral-500 mb-3">{t("globalLimitsInfo")}</p>
        <LimitInput
          label="Max risk per trade"
          value={limits.maxRiskPerTradePercent}
          unit="% of portfolio"
          onChange={(v) => setPolicy({ limits: { ...limits, maxRiskPerTradePercent: v } })}
        />
        <LimitInput
          label={t("maxSingleTrade")}
          value={limits.maxSingleTradeUsd}
          unit={t("usd")}
          onChange={(v) => setPolicy({ limits: { ...limits, maxSingleTradeUsd: v } })}
        />
      </div>

      {/* Daily Limits */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Daily Limits</h3>
        <LimitInput
          label="Daily loss limit"
          value={limits.dailyLossLimitPercent}
          unit="% of portfolio"
          onChange={(v) => setPolicy({ limits: { ...limits, dailyLossLimitPercent: v } })}
        />
        <LimitInput
          label={t("maxDailySpend")}
          value={limits.maxDailySpendUsd}
          unit={t("usd")}
          onChange={(v) => setPolicy({ limits: { ...limits, maxDailySpendUsd: v } })}
        />
        <LimitInput
          label={t("maxTradesDay")}
          value={limits.maxTradesPerDay}
          unit={t("trades")}
          onChange={(v) => setPolicy({ limits: { ...limits, maxTradesPerDay: v } })}
        />
      </div>

      {/* Portfolio Limits */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Portfolio Limits</h3>
        <LimitInput
          label="Max portfolio drawdown"
          value={limits.maxPortfolioDrawdownPercent}
          unit="%"
          onChange={(v) => setPolicy({ limits: { ...limits, maxPortfolioDrawdownPercent: v } })}
        />
        <LimitInput
          label="Max single position"
          value={limits.maxSinglePositionPercent}
          unit="% of portfolio"
          onChange={(v) => setPolicy({ limits: { ...limits, maxSinglePositionPercent: v } })}
        />
        <LimitInput
          label={t("maxOpenPositions")}
          value={limits.maxOpenPositions}
          unit={t("positionsUnit")}
          onChange={(v) => setPolicy({ limits: { ...limits, maxOpenPositions: v } })}
        />
      </div>

      {/* Safety Controls */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Safety Controls</h3>
        <LimitInput
          label="Cooldown between trades"
          value={Math.round(limits.cooldownBetweenTradesMs / 1000)}
          unit="seconds"
          onChange={(v) => setPolicy({ limits: { ...limits, cooldownBetweenTradesMs: v * 1000 } })}
        />
        <LimitInput
          label="Pause after consecutive losses"
          value={limits.consecutiveLossPause}
          unit="losses"
          onChange={(v) => setPolicy({ limits: { ...limits, consecutiveLossPause: v } })}
        />
      </div>

      {/* Per-Platform Overrides */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">
          {t("perExtensionOverrides")}
        </h3>
        <p className="text-[10px] text-neutral-500 mb-3">{t("perExtensionDesc")}</p>
        <div className="space-y-1.5">
          {Object.entries(platforms).map(([id, p]) => (
            <PlatformOverrideSection
              key={id}
              platformId={id}
              label={p.label}
              platformType={p.type}
              currencyLabel={p.currencyLabel}
              override={perPlatformOverrides[id]}
              globalLimits={limits}
              onUpdate={setPlatformOverride}
              onClear={clearPlatformOverride}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button className="px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-orange-900/30">
          {tc("save")}
        </button>
        <button className="px-4 py-2 rounded-md border border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] text-neutral-400 hover:text-neutral-200 text-sm cursor-pointer transition-all duration-300 hover:bg-[var(--glass-divider)]">
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}
