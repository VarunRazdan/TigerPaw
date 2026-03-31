import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRatio, ratioSeverity } from "@/lib/risk-metrics";
import { cn } from "@/lib/utils";
import { useStrategyStore } from "@/stores/strategy-store";
import { EquityCurveChart } from "./EquityCurveChart";

function MetricCard({
  label,
  value,
  severity,
}: {
  label: string;
  value: string;
  severity?: "good" | "neutral" | "bad";
}) {
  const color =
    severity === "good"
      ? "text-green-400"
      : severity === "bad"
        ? "text-red-400"
        : "text-neutral-300";
  return (
    <div className="text-center">
      <div className={cn("text-sm font-mono font-bold", color)}>{value}</div>
      <div className="text-[10px] text-neutral-500 mt-0.5">{label}</div>
    </div>
  );
}

export function BacktestPanel() {
  const { t } = useTranslation("strategies");
  const selectedStrategyId = useStrategyStore((s) => s.selectedStrategyId);
  const backtestResult = useStrategyStore((s) => s.backtestResult);
  const backtestRunning = useStrategyStore((s) => s.backtestRunning);
  const runBacktest = useStrategyStore((s) => s.runBacktest);

  const [days, setDays] = useState(365);
  const [capital, setCapital] = useState(10000);
  const [dataSource, setDataSource] = useState<"synthetic" | "alpaca">("synthetic");

  if (!selectedStrategyId) {
    return null;
  }

  const m = backtestResult?.metrics;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-2xl glass-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-neutral-300">{t("backtest")}</h4>
          <button
            onClick={() =>
              runBacktest(selectedStrategyId, { days, initialCapitalUsd: capital, dataSource })
            }
            disabled={backtestRunning}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              backtestRunning
                ? "bg-neutral-700 text-neutral-400 cursor-wait"
                : "bg-emerald-600 hover:bg-emerald-500 text-white",
            )}
          >
            {backtestRunning ? t("backtestRunning") : t("backtest")}
          </button>
        </div>
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Days
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-20 px-2 py-1 rounded-md bg-[var(--glass-subtle-hover)] border border-[var(--glass-border)] text-neutral-200 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Capital ($)
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="w-24 px-2 py-1 rounded-md bg-[var(--glass-subtle-hover)] border border-[var(--glass-border)] text-neutral-200 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Data Source
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as "synthetic" | "alpaca")}
              className="px-2 py-1 rounded-md bg-[var(--glass-subtle-hover)] border border-[var(--glass-border)] text-neutral-200 text-xs"
            >
              <option value="synthetic">Synthetic</option>
              <option value="alpaca">Alpaca (real)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Results */}
      {m && backtestResult && (
        <>
          {/* Metrics grid */}
          <div className="rounded-2xl glass-panel p-4">
            <h4 className="text-sm font-semibold text-neutral-300 mb-3">{t("backtestTitle")}</h4>
            <div className="grid grid-cols-4 gap-4 mb-3">
              <MetricCard
                label={t("totalReturn")}
                value={`${m.totalReturn >= 0 ? "+" : ""}${m.totalReturn.toFixed(1)}%`}
                severity={m.totalReturn >= 0 ? "good" : "bad"}
              />
              <MetricCard
                label={t("sharpeRatio")}
                value={formatRatio(m.sharpe)}
                severity={ratioSeverity(m.sharpe)}
              />
              <MetricCard
                label={t("sortinoRatio")}
                value={formatRatio(m.sortino)}
                severity={ratioSeverity(m.sortino)}
              />
              <MetricCard
                label={t("maxDrawdown")}
                value={`${m.maxDrawdownPercent.toFixed(1)}%`}
                severity={
                  m.maxDrawdownPercent > 20 ? "bad" : m.maxDrawdownPercent > 10 ? "neutral" : "good"
                }
              />
            </div>
            <div className="grid grid-cols-5 gap-3 pt-3 border-t border-[var(--glass-border)]">
              <MetricCard
                label={t("winRate")}
                value={`${m.winRate.toFixed(1)}%`}
                severity={m.winRate >= 50 ? "good" : "bad"}
              />
              <MetricCard
                label={t("profitFactor")}
                value={m.profitFactor != null ? m.profitFactor.toFixed(2) : "\u2014"}
              />
              <MetricCard label={t("avgWin")} value={`$${m.avgWin.toFixed(2)}`} severity="good" />
              <MetricCard label={t("avgLoss")} value={`$${m.avgLoss.toFixed(2)}`} severity="bad" />
              <MetricCard
                label={t("totalPnl")}
                value={`${m.totalPnl >= 0 ? "+" : ""}$${m.totalPnl.toFixed(2)}`}
                severity={m.totalPnl >= 0 ? "good" : "bad"}
              />
            </div>
            <div className="mt-2 text-[10px] text-neutral-600 text-right">
              {m.totalTrades} trades over {m.tradingDays} days \u2014 {backtestResult.durationMs}ms
              {" \u2014 "}
              <span
                className={
                  backtestResult.dataSource === "alpaca" ? "text-green-500" : "text-neutral-500"
                }
              >
                {backtestResult.dataSource ?? "synthetic"} data
                {backtestResult.dataCached ? " (cached)" : ""}
              </span>
              {backtestResult.dataWarning && (
                <span className="text-amber-400 ml-1">{backtestResult.dataWarning}</span>
              )}
            </div>
          </div>

          {/* Equity curve */}
          <EquityCurveChart data={backtestResult.equityCurve} initialCapital={capital} />
        </>
      )}

      {!backtestResult && !backtestRunning && (
        <div className="rounded-2xl glass-panel p-6 text-center text-neutral-500 text-sm">
          {t("noBacktest")}
        </div>
      )}
    </div>
  );
}
