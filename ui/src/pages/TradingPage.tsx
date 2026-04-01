import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { ApprovalQueuePanel } from "@/components/ApprovalQueuePanel";
import { DataModeSelector } from "@/components/DataModeSelector";
import { PlatformApiInfo } from "@/components/PlatformApiInfo";
import { PositionsPanel } from "@/components/PositionsPanel";
import { RiskOverviewPanel } from "@/components/RiskOverviewPanel";
import { TradeHistoryTable } from "@/components/TradeHistoryTable";
import { useTradingData } from "@/hooks/use-trading-data";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

export function TradingPage() {
  const { t } = useTranslation("trading");
  useTradingData();

  const {
    dailyPnlUsd,
    currentPortfolioValueUsd,
    limits,
    killSwitchActive,
    tier,
    approvalMode,
    platforms,
  } = useTradingStore();

  const lossPercent =
    currentPortfolioValueUsd > 0
      ? (Math.abs(Math.min(0, dailyPnlUsd)) / currentPortfolioValueUsd) * 100
      : 0;
  const usedPct =
    limits.dailyLossLimitPercent > 0
      ? Math.min(Math.round((lossPercent / limits.dailyLossLimitPercent) * 100), 100)
      : 0;

  const barColor = usedPct >= 80 ? "bg-red-500" : usedPct >= 50 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">{t("tradingHub")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t("mode")}: <span className="text-neutral-300 capitalize">{approvalMode}</span> ·{" "}
            {t("tier")}: <span className="text-neutral-300 capitalize">{tier}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataModeSelector />
          <NavLink
            to="/trading/settings"
            className="text-xs text-neutral-400 hover:text-neutral-200 px-3 py-1.5 rounded-md border border-[var(--glass-border)] hover:border-[var(--glass-border-hover-strong)] hover:bg-[var(--glass-input-bg)] transition-all duration-300 cursor-pointer"
          >
            {t("riskSettings")}
          </NavLink>
        </div>
      </div>

      {/* Summary banner */}
      <div
        className={cn(
          "rounded-2xl border p-3 flex items-center gap-4",
          killSwitchActive ? "border-red-800 bg-red-950/30" : "glass-panel",
        )}
      >
        {killSwitchActive && (
          <span className="text-red-400 text-sm font-semibold animate-pulse">
            {t("killSwitchActiveBanner")}
          </span>
        )}
        {!killSwitchActive && (
          <>
            <span className="text-neutral-400 text-xs">{t("dailyLossLimit")}:</span>
            <div className="flex-1 max-w-md h-3 bg-[var(--glass-subtle-hover)] rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  barColor,
                  usedPct >= 100 && "animate-pulse",
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <span className="text-xs font-mono text-neutral-400">
              {t("usedPercent", {
                percent: usedPct,
                current: lossPercent.toFixed(1),
                limit: limits.dailyLossLimitPercent,
              })}
            </span>
          </>
        )}
      </div>

      {/* 3-column dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RiskOverviewPanel />
        <ApprovalQueuePanel />
        <PositionsPanel />
      </div>

      {/* Trade history */}
      <TradeHistoryTable />

      {/* Platform API details (toggleable) */}
      <PlatformApiInfo platforms={platforms} />
    </div>
  );
}
