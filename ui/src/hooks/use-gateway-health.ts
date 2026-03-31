import { useCallback, useEffect, useRef } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";
import { useAppStore } from "@/stores/app-store";

const POLL_INTERVAL_MS = 30_000;
const RETRY_ATTEMPTS = 2;

/**
 * Polls `health` on the gateway every 30 s and updates the app store's
 * `gatewayOnline` / `gatewayConsecutiveFailures` fields.
 *
 * Exposes `checkNow()` so the ConnectionStatusBanner can offer a manual
 * "Retry now" button.
 */
export function useGatewayHealth(): { checkNow: () => void } {
  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    const { setGatewayOnline, incrementGatewayFailures, resetGatewayFailures } =
      useAppStore.getState();

    let ok = false;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await gatewayRpc("health", {});
        if (result.ok) {
          ok = true;
          break;
        }
      } catch {
        // transient — try again
      }
    }

    if (!mountedRef.current) {
      return;
    }

    if (ok) {
      setGatewayOnline(true);
      resetGatewayFailures();
    } else {
      setGatewayOnline(false);
      incrementGatewayFailures();
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [check]);

  return { checkNow: check };
}
