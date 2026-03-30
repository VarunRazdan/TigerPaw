/**
 * HTTP request stage that handles the OAuth2 callback redirect.
 *
 * When a user initiates an OAuth flow (e.g. "Connect Gmail"), their browser
 * is redirected to Google/Microsoft/Zoom. After consent, the provider redirects
 * back to `GET /integrations/oauth2/callback?code=...&state=...`.
 *
 * This handler:
 *  1. Validates the state parameter (CSRF protection via pendingFlows map)
 *  2. Exchanges the authorization code for tokens
 *  3. Saves the connection via IntegrationService
 *  4. Returns an HTML page the user can close
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getIntegrationService } from "../integrations/index.js";

const CALLBACK_PATH = "/integrations/oauth2/callback";

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.end(html);
}

function successPage(providerLabel: string, email?: string): string {
  const detail = email ? ` as <strong>${escapeHtml(email)}</strong>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connected — Tigerpaw</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #0a0a0f; color: #e5e5e5; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px;
            padding: 40px; text-align: center; max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0 0 8px; color: #22c55e; }
    p  { font-size: 14px; color: #a1a1aa; margin: 0 0 24px; }
    button { background: #22c55e; color: #000; border: none; border-radius: 8px;
             padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #16a34a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h1>${escapeHtml(providerLabel)} Connected</h1>
    <p>Successfully connected${detail}. You can close this window and return to Tigerpaw.</p>
    <p style="font-size:12px;color:#71717a">You may close this tab.</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connection Failed — Tigerpaw</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #0a0a0f; color: #e5e5e5; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px;
            padding: 40px; text-align: center; max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0 0 8px; color: #ef4444; }
    p  { font-size: 14px; color: #a1a1aa; margin: 0 0 24px; }
    .detail { font-size: 12px; color: #71717a; background: #09090b; border-radius: 8px;
              padding: 12px; margin: 0 0 24px; word-break: break-word; }
    button { background: #27272a; color: #e5e5e5; border: 1px solid #3f3f46; border-radius: 8px;
             padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #3f3f46; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>Connection Failed</h1>
    <p>Could not complete the integration setup.</p>
    <div class="detail">${escapeHtml(message)}</div>
    <p style="font-size:12px;color:#71717a">You may close this tab.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Handle `GET /integrations/oauth2/callback?code=...&state=...`
 *
 * Returns `true` if the request was handled (even on error), `false` if
 * the path doesn't match so the next stage can try.
 */
export async function handleOAuth2CallbackRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname !== CALLBACK_PATH) {
    return false;
  }

  // Only accept GET (browser redirect)
  if ((req.method ?? "GET").toUpperCase() !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // Provider returned an error (user denied consent, etc.)
  if (errorParam) {
    const description = url.searchParams.get("error_description") || errorParam;
    sendHtml(res, 200, errorPage(description));
    return true;
  }

  if (!code || !state) {
    sendHtml(res, 400, errorPage("Missing code or state parameter"));
    return true;
  }

  try {
    const service = getIntegrationService();
    const result = await service.completeOAuth(state, code);

    if ("error" in result) {
      sendHtml(res, 200, errorPage(result.error ?? "Unknown error"));
      return true;
    }

    sendHtml(res, 200, successPage(result.label, result.accountEmail));
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendHtml(res, 500, errorPage(message));
    return true;
  }
}
