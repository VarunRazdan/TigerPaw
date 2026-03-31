import { useEffect } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { retryAsync } from "@/lib/retry";
import { useAppStore } from "@/stores/app-store";
import { useNotificationStore } from "@/stores/notification-store";

/**
 * Fetches gateway config on mount and extracts `trading.enabled`.
 * Retries up to 3 times with a 2 s base backoff before giving up.
 * If the gateway is unreachable (demo/dev mode), keeps defaults (trading enabled).
 * Call this once in Layout so config loads on app startup.
 */
export function useGatewayConfig(): void {
  const setTradingEnabled = useAppStore((s) => s.setTradingEnabled);
  const setConfigLoaded = useAppStore((s) => s.setConfigLoaded);
  const configLoaded = useAppStore((s) => s.configLoaded);

  useEffect(() => {
    if (configLoaded) {
      return;
    }

    let cancelled = false;

    async function fetchConfig() {
      try {
        const result = await retryAsync(
          () => gatewayRpc<{ raw?: string }>("config.get", {}),
          () => true, // any failure is retryable at this stage
          { maxAttempts: 3, baseDelayMs: 2_000 },
        );
        if (cancelled) {
          return;
        }

        if (result.ok && result.payload?.raw) {
          try {
            const config = JSON.parse(result.payload.raw);
            const enabled = config?.trading?.enabled === true;
            setTradingEnabled(enabled);
          } catch (parseErr) {
            // Explicit JSON parse error — surface a warning so the user knows
            console.warn("[useGatewayConfig] Failed to parse config JSON:", parseErr);
            useNotificationStore.getState().addNotification({
              type: "system.config.parseError",
              title: "Config parse error",
              description: "Gateway returned invalid config JSON. Using defaults.",
              severity: "warning",
              timestamp: Date.now(),
            });
          }
        }
      } catch {
        // All retries exhausted or gateway unreachable — warn and keep defaults
        if (!cancelled) {
          useNotificationStore.getState().addNotification({
            type: "system.config.loadFailed",
            title: "Config load failed",
            description: "Could not reach gateway after multiple attempts. Using defaults.",
            severity: "warning",
            timestamp: Date.now(),
          });
        }
      } finally {
        if (!cancelled) {
          setConfigLoaded();
        }
      }
    }

    void fetchConfig();

    return () => {
      cancelled = true;
    };
  }, [configLoaded, setTradingEnabled, setConfigLoaded]);
}
