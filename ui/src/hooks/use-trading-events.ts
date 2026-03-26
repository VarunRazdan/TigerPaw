import { useEffect, useRef, useState } from "react";
import { useNotificationStore, eventSeverity, eventTitle } from "@/stores/notification-store";

/**
 * Persistent WebSocket hook that connects to the gateway, completes the
 * protocol-v3 handshake, and listens for `trading.*` broadcast events.
 *
 * Unlike `gateway-rpc.ts` (single-shot), this maintains a long-lived connection
 * and reconnects with exponential backoff on disconnect.
 */

type Frame = {
  type: string;
  id?: string;
  event?: string;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

function resolveGatewayWsUrl(): string {
  const loc = window.location;
  if (loc.port === "5173" || loc.port === "5174") {
    return "ws://127.0.0.1:18789";
  }
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${loc.host}`;
}

let idCounter = 0;
function nextId(): string {
  return `evt-${Date.now()}-${++idCounter}`;
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function useTradingEvents(): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!mountedRef.current) {
        return;
      }

      const url = resolveGatewayWsUrl();
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      let handshakeDone = false;

      ws.addEventListener("open", () => {
        // Reset backoff on successful connection
        backoffRef.current = MIN_BACKOFF_MS;
      });

      ws.addEventListener("close", () => {
        if (mountedRef.current) {
          setConnected(false);
          scheduleReconnect();
        }
      });

      ws.addEventListener("error", () => {
        // close will fire after error, triggering reconnect
      });

      ws.addEventListener("message", (ev) => {
        let frame: Frame;
        try {
          frame = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        // Step 1: Challenge → send connect
        if (frame.type === "event" && frame.event === "connect.challenge") {
          const connectId = nextId();
          ws.send(
            JSON.stringify({
              type: "req",
              id: connectId,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: "tigerpaw-control-ui",
                  version: "1.0.0",
                  platform: "browser",
                  mode: "ui",
                },
                caps: [],
                role: "operator",
                scopes: ["operator.admin"],
              },
            }),
          );
          return;
        }

        // Step 2: Hello-ok
        if (frame.type === "res" && !handshakeDone) {
          if (frame.ok) {
            handshakeDone = true;
            if (mountedRef.current) {
              setConnected(true);
            }
          }
          // If auth fails, we'll disconnect — close handler schedules reconnect
          return;
        }

        // Step 3: Trading events
        if (frame.type === "event" && frame.event?.startsWith("trading.")) {
          const payload = frame.payload ?? {};
          const type = frame.event;

          const store = useNotificationStore.getState();

          // Per-platform filtering: skip if the platform is disabled in settings.
          // Kill switch and limit events without an extensionId (global) always pass.
          const extId = payload.extensionId as string | undefined;
          if (extId && !store.isPlatformEnabled(extId)) {
            return;
          }

          store.addNotification({
            type,
            title: eventTitle(type, payload),
            description: formatEventDescription(type, payload),
            severity: eventSeverity(type),
            timestamp: Date.now(),
          });
        }
      });
    }

    function scheduleReconnect() {
      if (!mountedRef.current) {
        return;
      }
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
      reconnectTimer = setTimeout(connect, delay);
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return { connected };
}

function formatEventDescription(type: string, payload: Record<string, unknown>): string {
  const symbol = (payload.symbol as string) ?? "";
  const side = (payload.side as string) ?? "";
  const ext = (payload.extensionId as string) ?? "";
  const reason = (payload.reason as string) ?? "";
  const notional = payload.notionalUsd as number | undefined;
  const notionalStr = notional != null ? ` $${notional.toFixed(2)}` : "";

  switch (type) {
    case "trading.order.approved":
      return `${symbol} ${side}${notionalStr}${ext ? ` via ${ext}` : ""}`.trim();
    case "trading.order.denied":
      return reason || `${symbol} ${side} blocked by policy`.trim();
    case "trading.order.pending":
      return `Awaiting ${(payload.approvalMode as string) ?? "manual"} approval — ${symbol} ${side}${notionalStr}`.trim();
    case "trading.order.submitted":
      return `${symbol}${notionalStr}${ext ? ` via ${ext}` : ""}`.trim();
    case "trading.order.filled":
      return `${symbol} ${side}${notionalStr}${ext ? ` via ${ext}` : ""}`.trim();
    case "trading.order.failed":
      return reason || `${symbol} order failed`.trim();
    case "trading.killswitch.activated":
      return reason || `Trading halted${ext ? ` on ${ext}` : ""}`;
    case "trading.killswitch.deactivated":
      return `Trading resumed${ext ? ` on ${ext}` : ""}`;
    case "trading.limit.warning": {
      const limitName = (payload.limitName as string) ?? "";
      const pct = payload.currentPercent as number | undefined;
      const threshold = payload.thresholdPercent as number | undefined;
      if (pct != null && threshold != null) {
        return `${limitName} at ${pct.toFixed(0)}% of ${threshold}% limit`;
      }
      return `${limitName} approaching threshold`;
    }
    default:
      return reason || "Trading event";
  }
}
