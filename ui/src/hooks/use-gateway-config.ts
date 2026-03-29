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
        const result = await gatewayRpc<{ raw?: string; channelStatus?: ChannelStatus[] }>(
          "config.get",
          {},
        );
        if (cancelled) {
          return;
        }

        if (result.ok && result.payload?.raw) {
          try {
            const config = JSON.parse(result.payload.raw);
            const enabled = config?.trading?.enabled === true;
            setTradingEnabled(enabled);
            if (config?.gateway?.onboardingComplete === true) {
              setOnboardingComplete(true);
            }
          } catch {
            // Parse failed — keep defaults
          }
        }

        // Extract channel statuses if the gateway provides them
        if (result.ok && result.payload?.channelStatus) {
          setChannelStatuses(result.payload.channelStatus);
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
