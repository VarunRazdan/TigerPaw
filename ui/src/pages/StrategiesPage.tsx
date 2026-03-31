import {
  Play,
  Pause,
  Trash2,
  FlaskConical,
  ChevronRight,
  TrendingUp,
  Clock,
  Target,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BacktestPanel } from "@/components/BacktestPanel";
import { DataModeSelector } from "@/components/DataModeSelector";
import { cn } from "@/lib/utils";
import { useStrategyStore } from "@/stores/strategy-store";

function StrategyCard({
  strategy,
  selected,
  onSelect,
  onToggle,
  onDelete,
}: {
  strategy: ReturnType<typeof useStrategyStore.getState>["strategies"][number];
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("strategies");

  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-xl glass-panel p-3 cursor-pointer transition-all duration-200 border",
        selected
          ? "border-emerald-500/50 shadow-sm shadow-emerald-500/10"
          : "border-transparent hover:border-[var(--glass-active-border)]",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-neutral-200 truncate">{strategy.name}</h4>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                strategy.enabled
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-neutral-700 text-neutral-400",
              )}
            >
              {strategy.enabled ? t("enabled") : t("disabled")}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5 truncate">
            {strategy.description || strategy.symbols.join(", ")}
          </p>
        </div>
        <ChevronRight
          className={cn(
            "w-4 h-4 text-neutral-600 transition-transform",
            selected && "rotate-90 text-emerald-400",
          )}
        />
      </div>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          {strategy.symbols.length} {strategy.symbols.length === 1 ? "symbol" : "symbols"}
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {strategy.totalTrades} trades
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {strategy.lastExecutedAt
            ? new Date(strategy.lastExecutedAt).toLocaleDateString()
            : t("never")}
        </span>
      </div>

      {/* Performance row */}
      {strategy.totalTrades > 0 && (
        <div className="flex gap-3 mt-2 pt-2 border-t border-[var(--glass-border)] text-xs">
          <span
            className={cn(
              "font-mono",
              strategy.totalPnlUsd >= 0 ? "text-green-400" : "text-red-400",
            )}
          >
            {strategy.totalPnlUsd >= 0 ? "+" : ""}${strategy.totalPnlUsd.toFixed(2)}
          </span>
          <span className="text-neutral-400">
            {t("winRate")}: {strategy.winRate.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggle}
          className="p-1 rounded-md hover:bg-[var(--glass-subtle-hover)] text-neutral-400 hover:text-neutral-200 transition-colors"
          title={strategy.enabled ? "Disable" : "Enable"}
        >
          {strategy.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded-md hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
          title={t("deleteStrategy")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function StrategiesPage() {
  const { t } = useTranslation("strategies");
  const strategies = useStrategyStore((s) => s.strategies);
  const selectedStrategyId = useStrategyStore((s) => s.selectedStrategyId);
  const loading = useStrategyStore((s) => s.loading);
  const fetchStrategies = useStrategyStore((s) => s.fetchStrategies);
  const selectStrategy = useStrategyStore((s) => s.selectStrategy);
  const toggleStrategy = useStrategyStore((s) => s.toggleStrategy);
  const deleteStrategy = useStrategyStore((s) => s.deleteStrategy);

  useEffect(() => {
    void fetchStrategies();
  }, [fetchStrategies]);

  const selected = strategies.find((s) => s.id === selectedStrategyId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">{t("title")}</h1>
          <p className="text-sm text-neutral-500 mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <DataModeSelector />
          <FlaskConical className="w-5 h-5 text-emerald-400" />
          <span className="text-xs text-neutral-400">{strategies.length} strategies</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Strategy list */}
        <div className="lg:col-span-1 space-y-2">
          {loading && strategies.length === 0 && (
            <div className="rounded-2xl glass-panel p-8 text-center text-neutral-500 text-sm">
              Loading...
            </div>
          )}
          {!loading && strategies.length === 0 && (
            <div className="rounded-2xl glass-panel p-8 text-center text-neutral-500 text-sm">
              {t("noStrategies")}
            </div>
          )}
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              selected={strategy.id === selectedStrategyId}
              onSelect={() =>
                selectStrategy(strategy.id === selectedStrategyId ? null : strategy.id)
              }
              onToggle={() => toggleStrategy(strategy.id, !strategy.enabled)}
              onDelete={() => deleteStrategy(strategy.id)}
            />
          ))}
        </div>

        {/* Detail + Backtest */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              {/* Strategy detail */}
              <div className="rounded-2xl glass-panel p-4">
                <h3 className="text-lg font-semibold text-neutral-200 mb-1">{selected.name}</h3>
                <p className="text-xs text-neutral-500 mb-4">{selected.description}</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-neutral-500 mb-0.5">{t("platform")}</div>
                    <div className="text-neutral-200 font-medium">{selected.extensionId}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500 mb-0.5">{t("symbols")}</div>
                    <div className="text-neutral-200 font-medium">
                      {selected.symbols.join(", ")}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500 mb-0.5">{t("schedule")}</div>
                    <div className="text-neutral-200 font-medium">
                      {selected.schedule === "continuous"
                        ? t("continuous")
                        : `${t("interval")} (${(selected.intervalMs ?? 0) / 1000}s)`}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500 mb-0.5">{t("version")}</div>
                    <div className="text-neutral-200 font-medium">v{selected.version}</div>
                  </div>
                </div>

                {/* Signals */}
                <div className="mt-4 pt-3 border-t border-[var(--glass-border)]">
                  <div className="text-xs text-neutral-500 mb-2">
                    {t("signals")} ({selected.signals.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.signals.map((sig) => (
                      <span
                        key={sig.id}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--glass-subtle-hover)] text-neutral-300 border border-[var(--glass-border)]"
                      >
                        {sig.type} (w={sig.weight})
                      </span>
                    ))}
                    {selected.signals.length === 0 && (
                      <span className="text-[10px] text-neutral-600">None configured</span>
                    )}
                  </div>
                </div>

                {/* Rules */}
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--glass-border)] text-xs">
                  <div>
                    <div className="text-neutral-500 mb-0.5">{t("entryRule")}</div>
                    <div className="text-neutral-300">
                      {selected.entryRule.orderType} @{" "}
                      {(selected.entryRule.minSignalStrength * 100).toFixed(0)}% signal
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500 mb-0.5">{t("exitRule")}</div>
                    <div className="text-neutral-300">
                      {selected.exitRule.stopLossPercent != null &&
                        `SL: ${selected.exitRule.stopLossPercent}%`}
                      {selected.exitRule.takeProfitPercent != null &&
                        ` TP: ${selected.exitRule.takeProfitPercent}%`}
                      {selected.exitRule.stopLossPercent == null &&
                        selected.exitRule.takeProfitPercent == null &&
                        "None"}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500 mb-0.5">{t("positionSizing")}</div>
                    <div className="text-neutral-300">
                      {selected.positionSizing.method.replace("_", " ")}
                      {selected.positionSizing.fixedUsd != null &&
                        ` $${selected.positionSizing.fixedUsd}`}
                      {selected.positionSizing.percentPortfolio != null &&
                        ` ${selected.positionSizing.percentPortfolio}%`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Backtest panel */}
              <BacktestPanel />
            </>
          ) : (
            <div className="rounded-2xl glass-panel p-12 text-center text-neutral-500 text-sm">
              Select a strategy to view details and run backtests
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
