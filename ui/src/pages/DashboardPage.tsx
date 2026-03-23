import { NavLink } from "react-router-dom";
import { PlatformApiInfo } from "@/components/PlatformApiInfo";
import { PnlChart } from "@/components/PnlChart";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={cn("text-2xl font-bold font-mono", color ?? "text-neutral-100")}>{value}</div>
      {subtext && <div className="text-xs text-neutral-500 mt-1">{subtext}</div>}
    </div>
  );
}

export function DashboardPage() {
  const {
    dailyPnlUsd,
    dailyTradeCount,
    currentPortfolioValueUsd,
    positions,
    killSwitchActive,
    platforms,
  } = useTradingStore();

  const pnlColor = dailyPnlUsd >= 0 ? "text-green-400" : "text-red-400";
  const pnlSign = dailyPnlUsd >= 0 ? "+" : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-100">Tigerpaw Dashboard</h1>
        <p className="text-sm text-neutral-500 mt-1">Your AI trades. You decide.</p>
      </div>

      {killSwitchActive && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 flex items-center gap-3">
          <span className="text-red-400 text-lg">⛔</span>
          <div>
            <div className="text-sm font-semibold text-red-300">Kill Switch Active</div>
            <div className="text-xs text-red-400/70">
              All trading is halted. Go to Trading Hub to resume.
            </div>
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Portfolio Value" value={`$${currentPortfolioValueUsd.toLocaleString()}`} />
        <StatCard
          label="Daily P&L"
          value={`${pnlSign}$${Math.abs(dailyPnlUsd).toFixed(2)}`}
          color={pnlColor}
        />
        <StatCard label="Trades Today" value={String(dailyTradeCount)} />
        <StatCard label="Open Positions" value={String(positions.length)} />
      </div>

      {/* P&L Chart */}
      <PnlChart />

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NavLink
          to="/trading"
          className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 hover:border-orange-700 transition-colors group"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            Trading Hub →
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Risk dashboard, approval queue, positions, and trade history
          </p>
        </NavLink>

        <NavLink
          to="/trading/settings"
          className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 hover:border-orange-700 transition-colors group"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            Risk Settings →
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Configure risk tiers, approval modes, and position limits
          </p>
        </NavLink>

        <NavLink
          to="/security"
          className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 hover:border-orange-700 transition-colors group"
        >
          <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-orange-400 transition-colors">
            Security →
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Security audit, credential status, and extension permissions
          </p>
        </NavLink>
      </div>

      {/* Extensions status */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Trading Extensions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(platforms).map(([id, p]) => {
            const statusText = p.connected ? p.mode : "not connected";
            const dotColor = p.connected ? "bg-green-400" : "bg-neutral-600";
            const textColor = p.connected ? "text-neutral-300" : "text-neutral-500";
            return (
              <div key={id} className="flex items-center gap-2 py-2">
                <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
                <span className={cn("text-sm", textColor)}>{p.label}</span>
                <span className="text-xs text-neutral-600 ml-auto">{statusText}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Platform API details (toggleable) */}
      <PlatformApiInfo platforms={platforms} />
    </div>
  );
}
