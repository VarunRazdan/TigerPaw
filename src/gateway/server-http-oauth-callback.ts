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

/**
 * Match the upstream error string against known OAuth failure modes and
 * return a plain-English explanation + the most likely fix. Falls back to
 * showing the raw message when the cause isn't recognized.
 *
 * Patterns are matched case-insensitive and substring-based — providers
 * vary in casing and word order (Google: "redirect_uri_mismatch", Azure:
 * "AADSTS50011: The redirect URI ... does not match", Zoom: "Invalid
 * redirect URI").
 */
function explainError(message: string): { headline: string; detail: string; hint?: string } {
  const lower = message.toLowerCase();
  if (lower.includes("redirect_uri") || lower.includes("redirect uri")) {
    return {
      headline: "Redirect URI mismatch",
      detail:
        "The redirect URI registered in your OAuth app doesn't match the one Tigerpaw is using.",
      hint: 'Open Tigerpaw → Integrations → click the "set up" button for this provider, copy the redirect URI shown there, and paste it into your OAuth app\'s Authorized redirect URIs list.',
    };
  }
  if (lower.includes("invalid_client") || lower.includes("invalid client")) {
    return {
      headline: "Invalid Client ID or Secret",
      detail: "The Client ID or Secret in Tigerpaw's config doesn't match what's registered.",
      hint: "Re-enter the credentials via Tigerpaw → Integrations → set up. Make sure you copy the Secret (not the Secret ID) from the OAuth provider console.",
    };
  }
  if (lower.includes("access_denied") || lower.includes("access denied")) {
    return {
      headline: "Authorization Cancelled",
      detail: "You cancelled the consent screen before granting access.",
      hint: "Click Connect again from the Integrations page and approve the requested permissions.",
    };
  }
  if (lower.includes("invalid_grant") || lower.includes("invalid grant")) {
    return {
      headline: "Authorization Code Expired",
      detail:
        "The OAuth code expired before Tigerpaw could exchange it (typically because the callback was retried or took too long).",
      hint: "Click Connect again to start a fresh OAuth flow.",
    };
  }
  if (lower.includes("invalid_scope") || (lower.includes("scope") && lower.includes("invalid"))) {
    return {
      headline: "Insufficient Scopes",
      detail:
        "The OAuth app doesn't have one of the scopes Tigerpaw needs (e.g. gmail.send, Calendars.ReadWrite).",
      hint: "Open the OAuth provider console and add the missing scopes to your app, then click Connect again.",
    };
  }
  return {
    headline: "Connection Failed",
    detail: message,
  };
}

function errorPage(message: string): string {
  const explained = explainError(message);
  const hintBlock = explained.hint
    ? `<p style="font-size:13px;color:#a1a1aa;line-height:1.5;margin:0 0 16px;">${escapeHtml(explained.hint)}</p>`
    : "";
  // Show raw upstream message in a collapsible-ish detail block so power
  // users can still see the original. Suppress when our headline already
  // is the message itself (i.e. no pattern matched) to avoid duplication.
  const detailBlock =
    explained.headline !== "Connection Failed"
      ? `<div class="detail">${escapeHtml(message)}</div>`
      : `<div class="detail">${escapeHtml(explained.detail)}</div>`;
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
            padding: 40px; text-align: center; max-width: 480px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0 0 8px; color: #ef4444; }
    p  { font-size: 14px; color: #a1a1aa; margin: 0 0 24px; }
    .detail { font-size: 12px; color: #71717a; background: #09090b; border-radius: 8px;
              padding: 12px; margin: 0 0 16px; word-break: break-word; text-align: left;
              font-family: ui-monospace, SFMono-Regular, monospace; }
    a { color: #f97316; text-decoration: none; font-size: 13px; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>${escapeHtml(explained.headline)}</h1>
    <p>Could not complete the integration setup.</p>
    ${detailBlock}
    ${hintBlock}
    <p style="font-size:13px;color:#a1a1aa;margin:0 0 8px;">
      <a href="https://github.com/varunrazdan/tigerpaw/blob/main/docs/integrations/troubleshooting.md" target="_blank" rel="noopener">Troubleshooting guide &rarr;</a>
    </p>
    <p style="font-size:12px;color:#71717a;margin:0;">You may close this tab.</p>
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
