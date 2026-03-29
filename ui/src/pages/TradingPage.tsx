import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { ApprovalQueuePanel } from "@/components/ApprovalQueuePanel";
import { PlatformApiInfo } from "@/components/PlatformApiInfo";
import { PositionsPanel } from "@/components/PositionsPanel";
import { RiskOverviewPanel } from "@/components/RiskOverviewPanel";
import { TradeHistoryTable } from "@/components/TradeHistoryTable";
import { useTradingData } from "@/hooks/use-trading-data";
import { cn } from "@/lib/utils";
import { useMessageHubStore } from "@/stores/message-hub-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";
import { useWorkflowStore } from "@/stores/workflow-store";

// Seed demo data for visual review — only when demoMode is active
function useDemoData() {
  const store = useTradingStore();
  useEffect(() => {
    // Only seed when in demo mode and no data yet
    if (!store.demoMode || store.positions.length > 0) {
      return;
    }

    store.updateDailyMetrics({
      dailyPnlUsd: -47.2,
      dailySpendUsd: 312.5,
      dailyTradeCount: 7,
      consecutiveLosses: 1,
      currentPortfolioValueUsd: 10_250,
      highWaterMarkUsd: 10_800,
    });

    store.setPositions([
      {
        symbol: "AAPL",
        extensionId: "alpaca",
        quantity: 5,
        valueUsd: 890,
        unrealizedPnl: 12.4,
        percentOfPortfolio: 8.7,
      },
      {
        symbol: "BTC > $100K?",
        extensionId: "polymarket",
        quantity: 50,
        valueUsd: 250,
        unrealizedPnl: -30,
        percentOfPortfolio: 2.4,
      },
      {
        symbol: "Fed Rate Cut Mar",
        extensionId: "kalshi",
        quantity: 20,
        valueUsd: 84,
        unrealizedPnl: -29.6,
        percentOfPortfolio: 0.8,
      },
    ]);

    store.setTradeHistory([
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        approvalType: "auto_approved",
        extensionId: "alpaca",
        symbol: "MSFT",
        side: "BUY",
        amount: 824.6,
        result: "filled",
      },
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
        approvalType: "auto_approved",
        extensionId: "alpaca",
        symbol: "TSLA",
        side: "SELL",
        amount: 641.1,
        result: "filled",
      },
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
        approvalType: "denied",
        extensionId: "polymarket",
        symbol: "BTC > $110K?",
        side: "BUY",
        amount: 50,
        result: "denied",
        reason: "daily limit 80%+",
      },
      {
        timestamp: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
        approvalType: "manually_approved",
        extensionId: "kalshi",
        symbol: "GDP Q1",
        side: "BUY",
        amount: 4.2,
        result: "filled",
      },
    ]);

    store.addPendingApproval({
      id: "demo-1",
      extensionId: "alpaca",
      symbol: "AAPL",
      side: "buy",
      quantity: 5,
      notionalUsd: 890.5,
      riskPercent: 4.5,
      mode: "confirm",
      timeoutMs: 120_000,
      createdAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function syncAllDemoMode(enabled: boolean) {
  useTradingStore.getState().setDemoMode(enabled);
  useNotificationStore.getState().setDemoMode(enabled);
  useWorkflowStore.getState().setDemoMode(enabled);
  useMessageHubStore.getState().setDemoMode(enabled);
}

function DataModeSelector() {
  const { t } = useTranslation("trading");
  const demoMode = useTradingStore((s) => s.demoMode);

  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-subtle)] p-0.5">
      <button
        onClick={() => syncAllDemoMode(true)}
        className={cn(
          "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer",
          demoMode ? "bg-amber-600 text-white" : "text-neutral-500 hover:text-neutral-300",
        )}
      >
        {t("demoData", "Demo")}
      </button>
      <button
        onClick={() => syncAllDemoMode(false)}
        className={cn(
          "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer",
          !demoMode ? "bg-green-600 text-white" : "text-neutral-500 hover:text-neutral-300",
        )}
      >
        {t("liveData", "Live")}
      </button>
    </div>
  );
}

export function TradingPage() {
  const { t } = useTranslation("trading");
  useDemoData();
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
