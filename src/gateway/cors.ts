/**
 * CORS allowlist handler for the Tigerpaw gateway.
 *
 * Enforces an exact-match origin allowlist (no wildcards).
 * When no allowlist is configured, CORS headers are not sent (same-origin only).
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export type CorsConfig = {
  /** Exact origins to allow (e.g. ["https://app.tigerpaw.ai"]). No wildcards. */
  allowedOrigins: string[];
};

/**
 * Apply CORS headers if the request Origin is in the allowlist.
 * Returns true if this was a preflight OPTIONS request (caller should end response).
 */
export function handleCors(
  req: IncomingMessage,
  res: ServerResponse,
  config: CorsConfig | undefined,
): boolean {
  if (!config?.allowedOrigins.length) {
    return false;
  }

  const origin = req.headers.origin;
  if (!origin) {
    return false;
  }

  const isAllowed = config.allowedOrigins.includes(origin);
  if (!isAllowed) {
    // Origin not in allowlist — do not set any CORS headers.
    // For preflight, respond 403.
    if (req.method === "OPTIONS") {
      res.writeHead(403);
      res.end();
      return true;
    }
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Handle preflight.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  return false;
}
