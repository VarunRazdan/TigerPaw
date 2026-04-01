import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Persistent WebSocket hook that connects to the gateway, completes the
 * protocol-v3 handshake, and listens for `workflow.*` broadcast events.
 *
 * Exposes per-node execution state so the workflow canvas can render live
 * overlays (running spinners, success/error badges, duration labels).
 */

type Frame = {
  type: string;
  id?: string;
  event?: string;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

type NodeExecutionState = {
  status: "running" | "success" | "error" | "skipped";
  durationMs?: number;
  error?: string;
};

type WorkflowExecutionEvent = {
  type: string;
  executionId: string;
  payload: Record<string, unknown>;
};

type UseWorkflowEventsOptions = {
  /** Only listen for events matching this workflow ID. */
  workflowId?: string;
  /** Called when any workflow event is received. */
  onEvent?: (event: WorkflowExecutionEvent) => void;
};

type UseWorkflowEventsReturn = {
  /** Whether the WebSocket is connected. */
  connected: boolean;
  /** Current execution states per node (keyed by nodeId). */
  nodeStates: Map<string, NodeExecutionState>;
  /** Current execution ID being monitored, if any. */
  activeExecutionId: string | null;
  /** Clear all node states (e.g., before starting a new run). */
  clearStates: () => void;
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

export function useWorkflowEvents(options?: UseWorkflowEventsOptions): UseWorkflowEventsReturn {
  const [connected, setConnected] = useState(false);
  const [, setTick] = useState(0);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const nodeStatesRef = useRef<Map<string, NodeExecutionState>>(new Map());
  const activeExecutionIdRef = useRef<string | null>(null);
  const onEventRef = useRef(options?.onEvent);
  const workflowIdRef = useRef(options?.workflowId);

  // Keep refs in sync with latest options without re-running the effect
  onEventRef.current = options?.onEvent;
  workflowIdRef.current = options?.workflowId;

  const bump = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const clearStates = useCallback(() => {
    nodeStatesRef.current = new Map();
    activeExecutionIdRef.current = null;
    bump();
  }, [bump]);

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

        // Step 3: Workflow events
        if (frame.type === "event" && frame.event?.startsWith("workflow.")) {
          const payload = frame.payload ?? {};
          const type = frame.event;

          // Filter by workflowId if the option is set
          if (workflowIdRef.current && payload.workflowId !== workflowIdRef.current) {
            return;
          }

          const executionId = (payload.executionId as string) ?? "";

          // Notify callback
          onEventRef.current?.({ type, executionId, payload });

          // Update state
          const nodeId = payload.nodeId as string | undefined;

          switch (type) {
            case "workflow.node.start": {
              if (nodeId) {
                nodeStatesRef.current.set(nodeId, { status: "running" });
                bump();
              }
              break;
            }
            case "workflow.node.complete": {
              if (nodeId) {
                nodeStatesRef.current.set(nodeId, {
                  status: (payload.status as NodeExecutionState["status"]) ?? "success",
                  durationMs: payload.durationMs as number | undefined,
                  error: payload.error as string | undefined,
                });
                bump();
              }
              break;
            }
            case "workflow.execution.start": {
              nodeStatesRef.current = new Map();
              activeExecutionIdRef.current = executionId;
              bump();
              break;
            }
            case "workflow.execution.complete": {
              activeExecutionIdRef.current = null;
              bump();
              break;
            }
          }
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
  }, [bump]);

  return {
    connected,
    nodeStates: nodeStatesRef.current,
    activeExecutionId: activeExecutionIdRef.current,
    clearStates,
  };
}
