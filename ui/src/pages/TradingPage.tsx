import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ApprovalQueuePanel } from "@/components/ApprovalQueuePanel";
import { PlatformApiInfo } from "@/components/PlatformApiInfo";
import { PositionsPanel } from "@/components/PositionsPanel";
import { RiskOverviewPanel } from "@/components/RiskOverviewPanel";
import { TradeHistoryTable } from "@/components/TradeHistoryTable";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/stores/trading-store";

// Seed demo data for visual review
function useDemoData() {
  const store = useTradingStore();
  useEffect(() => {
    // Only seed once if no data
    if (store.positions.length > 0) {
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

export function TradingPage() {
  useDemoData();

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
          <h1 className="text-xl font-bold text-neutral-100">Trading Hub</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Mode: <span className="text-neutral-300 capitalize">{approvalMode}</span> · Tier:{" "}
            <span className="text-neutral-300 capitalize">{tier}</span>
          </p>
        </div>
        <NavLink
          to="/trading/settings"
          className="text-xs text-neutral-400 hover:text-neutral-200 px-3 py-1.5 rounded-md border border-neutral-700 hover:border-neutral-600 transition-colors"
        >
          Risk Settings →
        </NavLink>
      </div>

      {/* Summary banner */}
      <div
        className={cn(
          "rounded-lg border p-3 flex items-center gap-4",
          killSwitchActive
            ? "border-red-800 bg-red-950/30"
            : "border-neutral-800 bg-neutral-900/50",
        )}
      >
        {killSwitchActive && (
          <span className="text-red-400 text-sm font-semibold animate-pulse">
            ⛔ KILL SWITCH ACTIVE — All trading halted
          </span>
        )}
        {!killSwitchActive && (
          <>
            <span className="text-neutral-400 text-xs">Daily Loss Limit:</span>
            <div className="flex-1 max-w-md h-3 bg-neutral-800 rounded-full overflow-hidden">
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
              {usedPct}% used ({lossPercent.toFixed(1)}% / {limits.dailyLossLimitPercent}%)
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
