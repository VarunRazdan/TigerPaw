/**
 * Minimal browser-native WebSocket JSON-RPC client for the Tigerpaw gateway.
 * Single-shot: connect → handshake → call → disconnect.
 */

export type GatewayRpcResult<T> =
  | { ok: true; payload: T }
  | { ok: false; error: string; code?: string };

type GatewayRpcOptions = {
  token?: string;
  timeoutMs?: number;
};

function resolveGatewayWsUrl(): string {
  const loc = window.location;
  // Dev mode: Vite runs on 5173/5174, gateway on 18789
  if (loc.port === "5173" || loc.port === "5174") {
    return "ws://127.0.0.1:18789";
  }
  // Production: gateway serves the UI at same origin
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${loc.host}`;
}

let reqCounter = 0;
function nextId(): string {
  return `ui-${Date.now()}-${++reqCounter}`;
}

type Frame = {
  type: string;
  id?: string;
  event?: string;
  method?: string;
  ok?: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
};

export async function gatewayRpc<T>(
  method: string,
  params: unknown,
  options?: GatewayRpcOptions,
): Promise<GatewayRpcResult<T>> {
  const url = resolveGatewayWsUrl();
  const timeout = options?.timeoutMs ?? 8000;

  return new Promise((resolve) => {
    let ws: WebSocket;
    let settled = false;
    let handshakeDone = false;
    let rpcId: string | null = null;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws?.close();
        resolve({ ok: false, error: "Request timed out" });
      }
    }, timeout);

    function finish(result: GatewayRpcResult<T>) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      ws?.close();
      resolve(result);
    }

    try {
      ws = new WebSocket(url);
    } catch {
      clearTimeout(timer);
      resolve({ ok: false, error: "Gateway not reachable" });
      return;
    }

    ws.addEventListener("close", () => {
      if (!settled) {
        finish({ ok: false, error: "Connection closed unexpectedly" });
      }
    });

    ws.addEventListener("error", () => {
      finish({ ok: false, error: "Gateway not reachable" });
    });

    ws.addEventListener("message", (event) => {
      let frame: Frame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }

      // Step 1: Handle connect.challenge event
      if (frame.type === "event" && frame.event === "connect.challenge") {
        const nonce = (frame.payload as { nonce?: string } | undefined)?.nonce ?? "";
        if (!nonce) {
          finish({ ok: false, error: "Invalid challenge from gateway" });
          return;
        }

        const connectId = nextId();
        const connectReq = {
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
            ...(options?.token ? { auth: { token: options.token } } : {}),
          },
        };
        ws.send(JSON.stringify(connectReq));
        return;
      }

      // Step 2: Handle connect response (hello-ok)
      if (frame.type === "res" && !handshakeDone) {
        if (frame.ok === false) {
          const code = frame.error?.code;
          const msg = frame.error?.message ?? "Authentication failed";
          finish({
            ok: false,
            error: msg,
            code: code === "AUTH_REQUIRED" ? "AUTH_REQUIRED" : code,
          });
          return;
        }
        handshakeDone = true;

        // Now send the actual RPC request
        rpcId = nextId();
        ws.send(
          JSON.stringify({
            type: "req",
            id: rpcId,
            method,
            params,
          }),
        );
        return;
      }

      // Step 3: Handle the RPC response
      if (frame.type === "res" && frame.id === rpcId) {
        if (frame.ok) {
          finish({ ok: true, payload: frame.payload as T });
        } else {
          finish({
            ok: false,
            error: frame.error?.message ?? "Request failed",
            code: frame.error?.code,
          });
        }
      }
    });
  });
}
