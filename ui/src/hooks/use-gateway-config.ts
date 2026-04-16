import { useEffect } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { useAppStore, type ChannelStatus } from "@/stores/app-store";

/**
 * Fetches gateway config on mount and extracts `trading.enabled` + channel statuses.
 * If the gateway is unreachable (demo/dev mode), keeps defaults (trading enabled).
 * Call this once in Layout so config loads on app startup.
 */
export function useGatewayConfig(): void {
  const setTradingEnabled = useAppStore((s) => s.setTradingEnabled);
  const setConfigLoaded = useAppStore((s) => s.setConfigLoaded);
  const setChannelStatuses = useAppStore((s) => s.setChannelStatuses);
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const configLoaded = useAppStore((s) => s.configLoaded);

  useEffect(() => {
    if (configLoaded) {
      return;
    }

    let cancelled = false;

    async function fetchConfig() {
      try {
        const result = await gatewayRpc<{
          raw?: string;
          config?: Record<string, unknown>;
          channelStatus?: ChannelStatus[];
        }>("config.get", {});
        if (cancelled) {
          return;
        }

        if (result.ok) {
          // Read config from either parsed config object or raw JSON
          let config: Record<string, unknown> | null = null;
          if (result.payload?.config) {
            config = result.payload.config;
          } else if (result.payload?.raw) {
            try {
              config = JSON.parse(result.payload.raw);
            } catch {
              // Parse failed
            }
          }

          if (config) {
            const enabled = (config.trading as Record<string, unknown>)?.enabled !== false;
            setTradingEnabled(enabled);
            if ((config.gateway as Record<string, unknown>)?.onboardingComplete === true) {
              setOnboardingComplete(true);
            }
          }

          // Extract channel statuses
          if (result.payload?.channelStatus) {
            setChannelStatuses(result.payload.channelStatus);

            // Channels may still be connecting — re-fetch after a delay for fresh status
            const hasAnyEnabled = result.payload.channelStatus.some((c) => c.enabled);
            const hasAnyConnected = result.payload.channelStatus.some((c) => c.connected);
            if (hasAnyEnabled && !hasAnyConnected && !cancelled) {
              setTimeout(async () => {
                if (cancelled) {
                  return;
                }
                try {
                  const retry = await gatewayRpc<{ channelStatus?: ChannelStatus[] }>(
                    "config.get",
                    {},
                  );
                  if (!cancelled && retry.ok && retry.payload?.channelStatus) {
                    setChannelStatuses(retry.payload.channelStatus);
                  }
                } catch {
                  /* ignore */
                }
              }, 5000);
            }
          }
        }
      } catch {
        // Gateway unreachable — keep defaults (demo mode)
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
  }, [configLoaded, setTradingEnabled, setConfigLoaded, setChannelStatuses, setOnboardingComplete]);
}
