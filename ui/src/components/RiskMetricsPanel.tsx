import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { computeRiskMetrics, formatRatio, ratioSeverity } from "@/lib/risk-metrics";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

const SEVERITY_COLORS = {
  good: "text-green-400",
  neutral: "text-neutral-300",
  bad: "text-red-400",
};

function MetricCard({
  label,
  value,
  color,
  subtext,
}: {
  label: string;
  value: string;
  color?: string;
  subtext?: string;
}) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-[var(--glass-subtle)] border border-[var(--glass-border)]">
      <span className={cn("text-lg font-mono font-bold leading-none", color ?? "text-neutral-200")}>
        {value}
      </span>
      <span className="text-[10px] text-neutral-500 mt-1.5 text-center leading-tight">{label}</span>
      {subtext && <span className="text-[9px] text-neutral-600 mt-0.5">{subtext}</span>}
    </div>
  );
}

export function RiskMetricsPanel() {
  const { t } = useTranslation("trading");
  const pnlHistory = useTradingStore((s) => s.pnlHistory);
  const demoMode = useTradingStore((s) => s.demoMode);

  const metrics = useMemo(() => {
    const dailyPnl = pnlHistory.map((p) => p.pnl);
    return computeRiskMetrics(dailyPnl);
  }, [pnlHistory]);

  if (!demoMode && pnlHistory.length < 2) {
    return (
      <div className="rounded-2xl glass-panel p-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-2">{t("riskMetrics")}</h3>
        <p className="text-xs text-neutral-600 text-center py-4">{t("riskMetricsNoData")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-300">{t("riskMetrics")}</h3>
        <span className="text-[10px] text-neutral-600">
          {t("riskMetricsDays", { count: metrics.tradingDays })}
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <MetricCard
          label={t("sharpeRatio")}
          value={formatRatio(metrics.sharpe)}
          color={SEVERITY_COLORS[ratioSeverity(metrics.sharpe)]}
        />
        <MetricCard
          label={t("sortinoRatio")}
          value={formatRatio(metrics.sortino)}
          color={SEVERITY_COLORS[ratioSeverity(metrics.sortino)]}
        />
        <MetricCard
          label={t("maxDrawdown")}
          value={`${metrics.maxDrawdownPercent.toFixed(1)}%`}
          color={
            metrics.maxDrawdownPercent > 20
              ? "text-red-400"
              : metrics.maxDrawdownPercent > 10
                ? "text-amber-400"
                : "text-green-400"
          }
        />
        <MetricCard
          label={t("winRateLabel")}
          value={`${metrics.winRate.toFixed(0)}%`}
          color={metrics.winRate >= 50 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label={t("profitFactor")}
          value={metrics.profitFactor != null ? metrics.profitFactor.toFixed(2) : "\u2014"}
          color={
            metrics.profitFactor == null
              ? "text-neutral-500"
              : metrics.profitFactor >= 1.5
                ? "text-green-400"
                : metrics.profitFactor >= 1.0
                  ? "text-neutral-300"
                  : "text-red-400"
          }
        />
      </div>

      {/* Secondary stats row */}
      <div className="flex items-center justify-around mt-3 pt-3 border-t border-[var(--glass-border)]">
        <div className="text-center">
          <span className="text-xs font-mono text-green-400">+${metrics.avgWin.toFixed(2)}</span>
          <span className="block text-[9px] text-neutral-600">{t("avgWin")}</span>
        </div>
        <div className="text-center">
          <span className="text-xs font-mono text-red-400">-${metrics.avgLoss.toFixed(2)}</span>
          <span className="block text-[9px] text-neutral-600">{t("avgLoss")}</span>
        </div>
        <div className="text-center">
          <span
            className={cn(
              "text-xs font-mono",
              metrics.totalPnl >= 0 ? "text-green-400" : "text-red-400",
            )}
          >
            {metrics.totalPnl >= 0 ? "+" : ""}${metrics.totalPnl.toFixed(2)}
          </span>
          <span className="block text-[9px] text-neutral-600">{t("totalPnl")}</span>
        </div>
      </div>
    </div>
  );
}
