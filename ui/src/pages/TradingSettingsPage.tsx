import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTradingStore, type RiskTier, type ApprovalMode } from "@/stores/trading-store";

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
          className="w-20 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 font-mono text-right focus:border-orange-500 focus:outline-none"
        />
        <span className="text-xs text-neutral-500 w-16">{unit}</span>
      </div>
    </div>
  );
}

export function TradingSettingsPage() {
  const { tier, approvalMode, limits, setPolicy } = useTradingStore();

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
          className="text-xs text-neutral-400 hover:text-neutral-200 px-3 py-1.5 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
        >
          ← Back to Trading
        </NavLink>
      </div>

      {/* Risk Tier */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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
                "rounded-md border p-3 text-left transition-all",
                tier === key
                  ? "border-orange-600 bg-orange-950/30"
                  : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-600",
              )}
            >
              <div className="text-sm font-medium text-neutral-200">{preset.label}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">{preset.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Approval Mode */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Approval Mode</h3>
        <div className="space-y-2">
          {APPROVAL_MODES.map((mode) => (
            <label
              key={mode.value}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-all",
                approvalMode === mode.value
                  ? "border-orange-600 bg-orange-950/20"
                  : "border-neutral-700 hover:border-neutral-600",
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
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
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

      {/* Actions */}
      <div className="flex gap-3">
        <button className="px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">
          Save Policy
        </button>
        <button className="px-4 py-2 rounded-md border border-neutral-700 hover:border-neutral-600 text-neutral-400 hover:text-neutral-200 text-sm transition-colors">
          Reset to Tier Default
        </button>
      </div>
    </div>
  );
}
