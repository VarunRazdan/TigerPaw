import { useState, useEffect } from "react";
import { gatewayRpc } from "@/lib/gateway-rpc";

const DEFAULT_ASSISTANT_NAME = "Jarvis";

/** Fetches the configured assistant name from the gateway, defaulting to "Jarvis". */
export function useAssistantName(): string {
  const [name, setName] = useState(DEFAULT_ASSISTANT_NAME);
  useEffect(() => {
    let cancelled = false;
    void gatewayRpc<{ raw?: string }>("config.get", {}).then((res) => {
      if (cancelled || !res.ok || !res.payload?.raw) {
        return;
      }
      try {
        const cfg = JSON.parse(res.payload.raw);
        const n = cfg?.ui?.assistant?.name;
        if (typeof n === "string" && n.trim()) {
          setName(n.trim());
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return name;
}
