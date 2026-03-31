import { useEffect, useRef } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { useNotificationStore } from "@/stores/notification-store";
import { useTradingStore } from "@/stores/trading-store";

/** Normal polling interval when WebSocket is not connected. */
const POLL_INTERVAL_MS = 30_000;
/** Reduced polling interval when WebSocket IS connected (backup sync only). */
const POLL_INTERVAL_WS_MS = 120_000;
/** After this many consecutive failures we surface a stale-data warning. */
const STALE_THRESHOLD = 3;

type TradingStateResponse = {
  ok: boolean;
  dailyPnlUsd?: number;
  dailySpendUsd?: number;
  dailyTradeCount?: number;
  killSwitch?: { active: boolean; reason?: string; mode?: string };
  consecutiveLosses?: number;
  currentPortfolioValueUsd?: number;
  highWaterMarkUsd?: number;
  positionsByAsset?: Record<string, unknown>;
  date?: string;
};

/**
 * Polls `trading.getState` from the gateway when the trading store
 * is in live mode (demoMode === false). Adapts polling frequency:
 * - 30s when WebSocket is disconnected (primary data source)
 * - 120s when WebSocket is connected (backup consistency check)
 *
 * After 3 consecutive poll failures, surfaces a "data may be stale"
 * notification so the operator is aware.
 */
export function useTradingData(): void {
  const demoMode = useTradingStore((s) => s.demoMode);
  const wsConnected = useTradingStore((s) => s.wsConnected);
  const updateDailyMetrics = useTradingStore((s) => s.updateDailyMetrics);
  const setKillSwitch = useTradingStore((s) => s.setKillSwitch);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const staleWarningFiredRef = useRef(false);

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
          consecutiveFailuresRef.current += 1;
          maybeWarnStale();
          return;
        }

        // Success — reset failure counter
        consecutiveFailuresRef.current = 0;
        staleWarningFiredRef.current = false;

        const data = result.payload;
        if (data.dailyPnlUsd !== undefined) {
          updateDailyMetrics({
            dailyPnlUsd: data.dailyPnlUsd,
            dailySpendUsd: data.dailySpendUsd,
            dailyTradeCount: data.dailyTradeCount,
            consecutiveLosses: data.consecutiveLosses,
            currentPortfolioValueUsd: data.currentPortfolioValueUsd,
            highWaterMarkUsd: data.highWaterMarkUsd,
          });
        }
        if (data.killSwitch && typeof data.killSwitch === "object") {
          setKillSwitch(data.killSwitch.active, data.killSwitch.reason);
        }
      } catch {
        consecutiveFailuresRef.current += 1;
        maybeWarnStale();
      }
    }

    function maybeWarnStale() {
      if (consecutiveFailuresRef.current >= STALE_THRESHOLD && !staleWarningFiredRef.current) {
        staleWarningFiredRef.current = true;
        useNotificationStore.getState().addNotification({
          type: "system.data.stale",
          title: "Data may be stale",
          description:
            "Trading data could not be refreshed after multiple attempts. Displayed values may be outdated.",
          severity: "warning",
          timestamp: Date.now(),
        });
      }
    }

    // Always fetch immediately on mount or when WS state changes
    void fetchLiveData();

    // Adapt poll interval: frequent when WS is down, infrequent when WS provides real-time updates
    const interval = wsConnected ? POLL_INTERVAL_WS_MS : POLL_INTERVAL_MS;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(fetchLiveData, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [demoMode, wsConnected, updateDailyMetrics, setKillSwitch]);
}
