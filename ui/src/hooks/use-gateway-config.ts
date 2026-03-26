import { useEffect } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { useAppStore } from "@/stores/app-store";

/**
 * Fetches gateway config on mount and extracts `trading.enabled`.
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
        const result = await gatewayRpc<{ raw?: string }>("config.get", {});
        if (cancelled) {
          return;
        }

        if (result.ok && result.payload?.raw) {
          try {
            const config = JSON.parse(result.payload.raw);
            const enabled = config?.trading?.enabled === true;
            setTradingEnabled(enabled);
          } catch {
            // Parse failed — keep defaults
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
  }, [configLoaded, setTradingEnabled, setConfigLoaded]);
}
