import { useEffect, useRef } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { useTradingStore } from "@/stores/trading-store";

const POLL_INTERVAL_MS = 30_000;

type TradingStateResponse = {
  ok: boolean;
  dailyPnlUsd?: number;
  dailySpendUsd?: number;
  dailyTradeCount?: number;
  killSwitch?: boolean;
  currentPortfolioValueUsd?: number;
  highWaterMarkUsd?: number;
  positionsByAsset?: Record<string, unknown>;
  date?: string;
};

/**
 * Polls `trading.getState` from the gateway when the trading store
 * is in live mode (demoMode === false). Merges live data into the store.
 */
export function useTradingData(): void {
  const demoMode = useTradingStore((s) => s.demoMode);
  const updateDailyMetrics = useTradingStore((s) => s.updateDailyMetrics);
  const setKillSwitch = useTradingStore((s) => s.setKillSwitch);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (demoMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    async function fetchLiveData() {
      try {
        const result = await gatewayRpc<TradingStateResponse>("trading.getState", {});
        if (!result.ok || !result.payload?.ok) {
          return;
        }

        const data = result.payload;
        if (data.dailyPnlUsd !== undefined) {
          updateDailyMetrics({
            dailyPnlUsd: data.dailyPnlUsd,
            dailySpendUsd: data.dailySpendUsd,
            dailyTradeCount: data.dailyTradeCount,
            currentPortfolioValueUsd: data.currentPortfolioValueUsd,
            highWaterMarkUsd: data.highWaterMarkUsd,
          });
        }
        if (data.killSwitch !== undefined) {
          setKillSwitch(data.killSwitch);
        }
      } catch {
        // Gateway unreachable — skip this poll
      }
    }

    void fetchLiveData();
    intervalRef.current = setInterval(fetchLiveData, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [demoMode, updateDailyMetrics, setKillSwitch]);
}
