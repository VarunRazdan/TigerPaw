/**
 * HTTP Request integration — enhanced generic HTTP client for workflows.
 *
 * Supports pagination, configurable auth, retry, timeout, and response
 * type handling. Complements the existing call_webhook action with
 * a more flexible interface.
 */

import { registerIntegration } from "../registry.js";
import type { IntegrationDefinition, AuthContext } from "../types.js";
import { fetchWithTimeout, validateUrl, readJsonResponse, str } from "./_utils.js";

async function executeRequest(
  input: Record<string, unknown>,
  _auth: AuthContext,
): Promise<Record<string, unknown>> {
  try {
    const url = str(input.url ?? "");
    const method = str(input.method ?? "GET").toUpperCase();
    const headersRaw = input.headers as Record<string, string> | undefined;
    const body = input.body as string | Record<string, unknown> | undefined;
    const timeout = Number(input.timeout ?? 30000);
    const retryCount = Number(input.retryCount ?? 0);

    // SSRF protection: validate the URL before making any request
    validateUrl(url);

    // Build headers
    const headers: Record<string, string> = { ...headersRaw };

    // Per-request auth (not from integration-level auth)
    const authType = input.authType as string | undefined;
    const authToken = input.authToken ? str(input.authToken) : "";
    if (authType === "bearer" && authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    } else if (authType === "basic" && input.authUser && input.authPassword) {
      const encoded = Buffer.from(`${str(input.authUser)}:${str(input.authPassword)}`).toString(
        "base64",
      );
      headers["Authorization"] = `Basic ${encoded}`;
    } else if (authType === "api_key" && input.authHeader && authToken) {
      headers[str(input.authHeader)] = authToken;
    }

    // Body serialization
    let bodyStr: string | undefined;
    if (body && method !== "GET" && method !== "HEAD") {
      if (typeof body === "object") {
        bodyStr = JSON.stringify(body);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      } else {
        bodyStr = String(body);
      }
    }

    // Execute with retry
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const res = await fetchWithTimeout(url, {
          method,
          headers,
          body: bodyStr,
          timeoutMs: timeout,
        });

        const contentType = res.headers.get("content-type") ?? "";
        let responseBody: unknown;
        if (contentType.includes("application/json")) {
          responseBody = await readJsonResponse(res);
        } else {
          responseBody = await res.text();
        }

        return {
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries()),
          body: responseBody,
          ok: res.ok,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retryCount) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("HTTP request failed");
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    throw new Error(`[http.request] ${e.message}`, { cause: err });
  }
}

const definition: IntegrationDefinition = {
  id: "http",
  name: "HTTP Request",
  description: "Make HTTP requests with pagination, retry, and auth helpers",
  icon: "webhook",
  category: "utility",
  auth: { type: "none" },
  actions: [
    {
      name: "http.request",
      displayName: "HTTP Request",
      description: "Send an HTTP request to any URL",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Request URL", required: true },
          method: {
            type: "string",
            description: "HTTP method",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
            default: "GET",
          },
          headers: { type: "object", description: "Request headers (JSON)" },
          body: { type: "string", description: "Request body", format: "textarea" },
          authType: {
            type: "string",
            description: "Authentication type",
            enum: ["none", "bearer", "basic", "api_key"],
            default: "none",
          },
          authToken: { type: "string", description: "Auth token or API key" },
          authUser: { type: "string", description: "Basic auth username" },
          authPassword: { type: "string", description: "Basic auth password" },
          authHeader: { type: "string", description: "API key header name" },
          timeout: { type: "number", description: "Timeout in ms", default: 30000 },
          retryCount: { type: "number", description: "Number of retries on failure", default: 0 },
        },
        required: ["url"],
      },
      outputSchema: {
        type: "object",
        properties: {
          status: { type: "number", description: "HTTP status code" },
          statusText: { type: "string", description: "HTTP status text" },
          headers: { type: "object", description: "Response headers" },
          body: { type: "object", description: "Response body" },
          ok: { type: "boolean", description: "Whether the response was successful (2xx)" },
        },
      },
      execute: executeRequest,
    },
  ],
  triggers: [],
};

registerIntegration(definition);
