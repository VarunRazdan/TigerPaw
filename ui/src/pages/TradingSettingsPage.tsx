import { useState, useMemo } from "react";
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

const TIER_PRESETS: Record<Exclude<RiskTier, "custom">, { label: string; desc: string }> = {
  conservative: { label: "Conservative", desc: "Safest — manual approval, tight limits" },
  moderate: { label: "Moderate", desc: "Balanced — confirm with auto-approve timeout" },
  aggressive: { label: "Aggressive", desc: "Fast — auto-approval, wide limits" },
};

const APPROVAL_MODES: { value: ApprovalMode; label: string; desc: string }[] = [
  { value: "auto", label: "Auto", desc: "Trades within limits execute instantly" },
  { value: "confirm", label: "Confirm", desc: "15s popup, auto-approves if no response" },
  { value: "manual", label: "Manual", desc: "Every trade needs explicit approval" },
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
  override,
  globalLimits,
  onUpdate,
  onClear,
}: {
  platformId: string;
  label: string;
  override?: PerPlatformOverride;
  globalLimits: PolicyLimits;
  onUpdate: (id: string, o: PerPlatformOverride) => void;
  onClear: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOverrides = override && Object.keys(override).length > 0;

  return (
    <div className="border border-[var(--glass-border)] rounded-xl hover:border-[var(--glass-hover-strong)] transition-all duration-300">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--glass-divider)] transition-all duration-300"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-neutral-300">{label}</span>
          {hasOverrides && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400 border border-orange-800/50">
              custom
            </span>
          )}
        </div>
        <span className="text-[10px] text-neutral-500">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--glass-divider)]">
          <p className="text-[10px] text-neutral-500 mt-2 mb-2">
            Override global limits for {label}. Leave blank to use global defaults.
          </p>
          <LimitInput
            label="Max single trade"
            value={override?.maxSingleTradeUsd ?? globalLimits.maxSingleTradeUsd}
            unit="USD"
            onChange={(v) => onUpdate(platformId, { ...override, maxSingleTradeUsd: v })}
          />
          <LimitInput
            label="Max daily spend"
            value={override?.maxDailySpendUsd ?? globalLimits.maxDailySpendUsd}
            unit="USD"
            onChange={(v) => onUpdate(platformId, { ...override, maxDailySpendUsd: v })}
          />
          <LimitInput
            label="Max trades/day"
            value={override?.maxTradesPerDay ?? globalLimits.maxTradesPerDay}
            unit="trades"
            onChange={(v) => onUpdate(platformId, { ...override, maxTradesPerDay: v })}
          />
          <LimitInput
            label="Max open positions"
            value={override?.maxOpenPositions ?? globalLimits.maxOpenPositions}
            unit="positions"
            onChange={(v) => onUpdate(platformId, { ...override, maxOpenPositions: v })}
          />
          {hasOverrides && (
            <button
              onClick={() => onClear(platformId)}
              className="mt-2 text-[10px] text-red-400 hover:text-red-300 transition-colors"
            >
              Clear overrides (use global)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DataModeSelector() {
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
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">Data Source</h3>
        <p className="text-[11px] text-neutral-500 mb-3">
          {demoMode
            ? "Viewing sample data. Switch to Live to connect to the gateway."
            : "Connected to the gateway for real-time data."}
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
            Demo
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
            Live
          </button>
        </div>
      </div>

      <AlertDialog open={confirmLive} onOpenChange={setConfirmLive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Live Data?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-neutral-400">
                <p>
                  Live mode shows real positions, trades, and portfolio data from your connected
                  trading platforms. The demo sample data will be hidden.
                </p>
                <p>If you haven't started Tigerpaw yet, open a terminal and run:</p>
                <code className="block rounded-lg bg-[var(--glass-input-bg)] border border-[var(--glass-border)] px-3 py-2 text-xs font-mono text-neutral-300">
                  tigerpaw start
                </code>
                <p className="text-xs text-neutral-500">
                  If the server isn't running, the dashboard will show empty data — nothing will
                  break. You can always switch back to Demo.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on Demo</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-700 hover:bg-green-600 text-white"
              onClick={() => {
                setDemoMode(false);
                setConfirmLive(false);
              }}
            >
              Switch to Live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ThemeSelector() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Appearance</h3>
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][]).map(([id, info]) => (
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
            <div className="text-sm font-semibold text-neutral-200">{info.label}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">{info.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

type RemoteAccessMode = "local" | "tailscale" | "cloudflare";

function RemoteAccessSection() {
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
      <h3 className="text-sm font-semibold text-neutral-300 mb-1">Dashboard Access</h3>
      <p className="text-[11px] text-neutral-500 mb-3">
        How you access the Tigerpaw dashboard. API keys and trade execution always stay on this
        machine.
      </p>

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
              Local only{" "}
              <span className="text-[10px] text-green-400 font-normal ml-1">most secure</span>
            </div>
            <div className="text-xs text-neutral-500">
              Dashboard only accessible on this machine (localhost:18789)
            </div>
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
              Tailscale{" "}
              <span className="text-[10px] text-blue-400 font-normal ml-1">
                end-to-end encrypted
              </span>
            </div>
            <div className="text-xs text-neutral-500">
              Access from your devices via WireGuard mesh VPN. Requires Tailscale on both server and
              client devices.
            </div>
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
              Cloudflare Tunnel{" "}
              <span className="text-[10px] text-amber-400 font-normal ml-1">easiest setup</span>
            </div>
            <div className="text-xs text-neutral-500">
              Access from anywhere via HTTPS. Only requires{" "}
              <code className="text-[10px] bg-[var(--glass-input-bg)] px-1 rounded">
                cloudflared
              </code>{" "}
              on the server.
            </div>
          </div>
        </label>
      </div>

      {/* Security warning for non-local modes */}
      {mode !== "local" && (
        <div className="mt-3 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-xs">
          <div className="font-semibold text-amber-400 mb-2">What stays on your machine:</div>
          <ul className="space-y-1 text-neutral-400 mb-3">
            <li className="flex items-center gap-1.5">
              <span className="text-green-400">✓</span> API keys and exchange credentials
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-green-400">✓</span> Audit logs and trade records
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-green-400">✓</span> Order execution (trades placed from this
              machine)
            </li>
          </ul>
          <div className="font-semibold text-amber-400 mb-2">What becomes remotely viewable:</div>
          <ul className="space-y-1 text-neutral-400">
            <li className="flex items-center gap-1.5">
              <span className="text-amber-400">→</span> Dashboard UI (positions, P&L, charts)
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-amber-400">→</span> Kill switch toggle
            </li>
            <li className="flex items-center gap-1.5">
              <span className="text-amber-400">→</span> Trade approval queue
            </li>
          </ul>
        </div>
      )}

      {/* Tailscale-specific instructions */}
      {mode === "tailscale" && (
        <div className="mt-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-input-bg)] p-3 text-xs space-y-2">
          <div className="font-medium text-neutral-300">Setup</div>
          <ol className="space-y-1.5 text-neutral-400 list-decimal list-inside">
            <li>
              Install{" "}
              <a
                href="https://tailscale.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Tailscale
              </a>{" "}
              on this server <strong className="text-neutral-300">and</strong> every device you want
              to access the dashboard from
            </li>
            <li>Sign in to the same Tailscale network on both</li>
            <li>
              Click &quot;Save &amp; Restart&quot; below — the dashboard will bind to your Tailscale
              IP
            </li>
            <li>
              Open{" "}
              <code className="bg-[var(--glass-input-bg)] px-1 rounded text-[10px]">
                http://&lt;tailscale-ip&gt;:18789
              </code>{" "}
              from any connected device
            </li>
          </ol>
          <p className="text-[10px] text-neutral-500 mt-2">
            Tailscale uses WireGuard — traffic is encrypted end-to-end. Not even Tailscale&apos;s
            relay servers can decrypt your data.
          </p>
        </div>
      )}

      {/* Cloudflare-specific instructions */}
      {mode === "cloudflare" && (
        <div className="mt-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-input-bg)] p-3 text-xs space-y-2">
          <div className="font-medium text-neutral-300">Setup</div>
          <ol className="space-y-1.5 text-neutral-400 list-decimal list-inside">
            <li>
              Install{" "}
              <a
                href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                cloudflared
              </a>{" "}
              on this server (no install needed on your phone/laptop)
            </li>
            <li>
              Run:{" "}
              <code className="bg-[var(--glass-input-bg)] px-1 rounded text-[10px]">
                cloudflared tunnel --url http://localhost:18789
              </code>
            </li>
            <li>Copy the tunnel URL below and click &quot;Save &amp; Restart&quot;</li>
          </ol>
          <div className="mt-2">
            <label className="text-[10px] text-neutral-500 block mb-1">Tunnel URL</label>
            <input
              type="text"
              value={tunnelUrl}
              onChange={(e) => setTunnelUrl(e.target.value)}
              placeholder="https://your-tunnel.cfargotunnel.com"
              className="w-full bg-[var(--glass-input-bg)] border border-[var(--glass-border)] rounded px-2 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <p className="text-[10px] text-amber-500 mt-1">
            Cloudflare decrypts traffic at their edge — they can technically see dashboard data in
            transit. Your API keys are never sent to the dashboard, so they remain safe.
          </p>
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
              ? "Saving..."
              : saveStatus === "saved"
                ? "Saved — Restart Gateway to Apply"
                : "Save & Restart Gateway"}
          </button>
          {saveStatus === "error" && saveError && (
            <p className="text-xs text-red-400 mt-1.5">{saveError}</p>
          )}
          {saveStatus === "error" && !saveError && (
            <p className="text-xs text-red-400 mt-1.5">
              Gateway not reachable — start Tigerpaw first
            </p>
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
  const toastsEnabled = useNotificationStore((s) => s.toastsEnabled);
  const setToastsEnabled = useNotificationStore((s) => s.setToastsEnabled);
  const browserNotificationsEnabled = useNotificationStore((s) => s.browserNotificationsEnabled);
  const setBrowserNotifications = useNotificationStore((s) => s.setBrowserNotifications);
  const platformFilters = useNotificationStore((s) => s.platformFilters);
  const setPlatformFilter = useNotificationStore((s) => s.setPlatformFilter);
  const { platforms } = useTradingStore();

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
      <h3 className="text-sm font-semibold text-neutral-300 mb-3">Notifications</h3>
      <div className="space-y-3">
        {/* Toast popups */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm text-neutral-200">Toast Popups</div>
            <div className="text-[11px] text-neutral-500">
              Show temporary notifications in the bottom-right corner
            </div>
          </div>
          <ToggleSwitch enabled={toastsEnabled} onToggle={() => setToastsEnabled(!toastsEnabled)} />
        </label>

        {/* Browser notifications */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm text-neutral-200">Browser Notifications</div>
            <div className="text-[11px] text-neutral-500">
              Desktop alerts for errors and warnings (even when tab is in background)
            </div>
          </div>
          <ToggleSwitch
            enabled={browserNotificationsEnabled}
            onToggle={() => handleBrowserToggle(!browserNotificationsEnabled)}
          />
        </label>

        {/* Per-platform filters */}
        <div className="pt-2 border-t border-[var(--glass-divider)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-neutral-400">Notify by Platform</div>
            <button
              onClick={() => {
                const newVal = !allEnabled;
                for (const id of Object.keys(platformFilters)) {
                  setPlatformFilter(id, newVal);
                }
              }}
              className="text-[10px] text-orange-500/70 hover:text-orange-400 transition-colors cursor-pointer"
            >
              {allEnabled ? "Disable All" : "Enable All"}
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
          <div className="text-[10px] text-neutral-600 mt-2">
            Global events (kill switch, limit warnings) are always shown regardless of platform
            filter.
          </div>
        </div>

        {/* Info */}
        <div className="text-[10px] text-neutral-600 pt-1 border-t border-[var(--glass-divider)]">
          Up to 50 notifications are kept in memory. The bell badge shows up to 9+. Notifications
          persist until dismissed or cleared.
        </div>
      </div>
    </div>
  );
}

export function TradingSettingsPage() {
  const {
    tier,
    approvalMode,
    limits,
    platforms,
    perPlatformOverrides,
    setPolicy,
    setPlatformOverride,
    clearPlatformOverride,
  } = useTradingStore();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Trading Policy</h1>
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

      {/* Data Source */}
      <DataModeSelector />

      {/* Remote Dashboard Access */}
      <RemoteAccessSection />

      {/* Notifications */}
      <NotificationSettings />

      {/* Risk Tier */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Risk Tier</h3>
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
              <div className="text-sm font-medium text-neutral-200">{preset.label}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">{preset.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Approval Mode */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Approval Mode</h3>
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
                <div className="text-sm font-medium text-neutral-200">{mode.label}</div>
                <div className="text-xs text-neutral-500">{mode.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Per-Trade Limits */}
      <div className="rounded-2xl glass-panel p-4 transition-all duration-300">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Per-Trade Limits</h3>
        <LimitInput
          label="Max risk per trade"
          value={limits.maxRiskPerTradePercent}
          unit="% of portfolio"
          onChange={(v) => setPolicy({ limits: { ...limits, maxRiskPerTradePercent: v } })}
        />
        <LimitInput
          label="Max single trade"
          value={limits.maxSingleTradeUsd}
          unit="USD"
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
          label="Max daily spend"
          value={limits.maxDailySpendUsd}
          unit="USD"
          onChange={(v) => setPolicy({ limits: { ...limits, maxDailySpendUsd: v } })}
        />
        <LimitInput
          label="Max trades per day"
          value={limits.maxTradesPerDay}
          unit="trades"
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
          label="Max open positions"
          value={limits.maxOpenPositions}
          unit="positions"
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
        <h3 className="text-sm font-semibold text-neutral-300 mb-1">Per-Platform Overrides</h3>
        <p className="text-[10px] text-neutral-500 mb-3">
          Customize risk limits for individual platforms. These override the global limits above.
        </p>
        <div className="space-y-1.5">
          {Object.entries(platforms).map(([id, p]) => (
            <PlatformOverrideSection
              key={id}
              platformId={id}
              label={p.label}
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
          Save Policy
        </button>
        <button className="px-4 py-2 rounded-md border border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] text-neutral-400 hover:text-neutral-200 text-sm cursor-pointer transition-all duration-300 hover:bg-[var(--glass-divider)]">
          Reset to Tier Default
        </button>
      </div>
    </div>
  );
}
