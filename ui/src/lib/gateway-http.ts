/**
 * Thin HTTP client for invoking gateway tools via the /tools/invoke endpoint.
 * Used by the UI to place trades through the same policy-gated tool pipeline
 * that the AI agent uses via messaging channels.
 */

export type ToolInvokeResult<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: string; errorType?: string };

function resolveGatewayHttpUrl(): string {
  const loc = window.location;
  // Dev mode: Vite runs on 5173/5174, gateway on 18789
  if (loc.port === "5173" || loc.port === "5174") {
    return "http://127.0.0.1:18789";
  }
  // Production: gateway serves the UI at same origin
  return loc.origin;
}

export async function invokeToolHttp<T = unknown>(
  tool: string,
  args: Record<string, unknown>,
  options?: { token?: string; timeoutMs?: number },
): Promise<ToolInvokeResult<T>> {
  const url = `${resolveGatewayHttpUrl()}/tools/invoke`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 15000);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options?.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool, args }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: data.error?.message ?? `Request failed (${res.status})`,
        errorType: data.error?.type,
      };
    }
    return { ok: true, result: data.result as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Request timed out" };
    }
    return { ok: false, error: "Gateway not reachable" };
  } finally {
    clearTimeout(timeout);
  }
}
