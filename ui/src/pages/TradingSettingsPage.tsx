import { useState } from "react";
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
import { cn } from "@/lib/utils";
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
