/**
 * OAuth2 authorization code flow handler for integrations.
 *
 * Manages the full OAuth lifecycle:
 * 1. Generate authorization URL with state token
 * 2. Exchange authorization code for tokens
 * 3. Refresh tokens before expiry
 */

import crypto from "node:crypto";
import { loadConfig } from "../config/io.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getIntegration } from "./sdk/registry.js";
import type {
  IntegrationConnectionFull,
  IntegrationProviderDefinition,
  IntegrationProviderId,
  OAuth2TokenSet,
} from "./types.js";
import { getProviderDefinition } from "./types.js";

const log = createSubsystemLogger("integrations/oauth2");

// ── Pending OAuth flows (in-memory, short-lived) ─────────────────

type PendingOAuthFlow = {
  providerId: IntegrationProviderId;
  state: string;
  createdAt: number;
  redirectUri: string;
  /**
   * PKCE code verifier (RFC 7636). Generated server-side; never leaves this
   * process. The code_challenge derived from it is sent to the IdP at
   * authorization time, and this verifier is sent to the IdP at token
   * exchange time, proving the same client started and finished the flow.
   * `null` for providers that opt out of PKCE (e.g. Atlassian 3LO).
   */
  codeVerifier: string | null;
};

const pendingFlows = new Map<string, PendingOAuthFlow>();

/**
 * TTL for a pending state. Was 10 min — shrunk to 3 min so a stolen state
 * value has a small replay window. 3 minutes is plenty for an interactive
 * consent flow and well above typical IdP redirect latency.
 */
const PENDING_FLOW_TTL_MS = 3 * 60 * 1000;
/** Hard cap to bound memory; if exceeded after cleanup, reject new flows. */
const MAX_PENDING_FLOWS = 32;

// Clean up stale flows
function cleanStalePendingFlows(): void {
  const cutoff = Date.now() - PENDING_FLOW_TTL_MS;
  for (const [state, flow] of pendingFlows) {
    if (flow.createdAt < cutoff) {
      pendingFlows.delete(state);
    }
  }
}

/**
 * PKCE: generate the code_verifier (high-entropy random) and the
 * S256 code_challenge that Tigerpaw sends to the IdP up front. All 7
 * configured providers (Gmail / Outlook / Google Calendar / Outlook
 * Calendar / Zoom / Google Meet / MS Teams) accept S256; there is no
 * provider-specific path here.
 */
function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ── Credential resolution (config → env fallback) ───────────────

type OAuthGroup = "google" | "microsoft" | "zoom" | "atlassian";

const ENV_TO_GROUP: Record<string, OAuthGroup> = {
  GOOGLE_CLIENT_ID: "google",
  GOOGLE_CLIENT_SECRET: "google",
  MICROSOFT_CLIENT_ID: "microsoft",
  MICROSOFT_CLIENT_SECRET: "microsoft",
  ZOOM_CLIENT_ID: "zoom",
  ZOOM_CLIENT_SECRET: "zoom",
  ATLASSIAN_CLIENT_ID: "atlassian",
  ATLASSIAN_CLIENT_SECRET: "atlassian",
};

export function resolveOAuthCredential(
  envVar: string,
  field: "clientId" | "clientSecret",
): string | undefined {
  // Env vars take priority (backward compatible)
  const envValue = process.env[envVar];
  if (envValue) {
    return envValue;
  }
  // Fall back to config
  const cfg = loadConfig();
  const group = ENV_TO_GROUP[envVar];
  if (!group) {
    return undefined;
  }
  const raw = cfg.integrations?.oauth?.[group]?.[field];
  if (typeof raw === "string") {
    return raw || undefined;
  }
  // Handle SecretRef with env source
  if (raw && typeof raw === "object" && "source" in raw) {
    const ref = raw;
    if (ref.source === "env") {
      return process.env[ref.id] || undefined;
    }
  }
  return undefined;
}

// ── Authorization URL generation ─────────────────────────────────

export type StartOAuthResult = {
  authUrl: string;
  state: string;
};

export function startOAuthFlow(
  providerId: IntegrationProviderId,
  gatewayPort: number,
): StartOAuthResult | { error: string } {
  cleanStalePendingFlows();

  const provider = resolveProviderWithSdk(providerId);
  if (!provider?.oauth2Config) {
    return { error: `No OAuth2 config for provider: ${providerId}` };
  }

  const { oauth2Config } = provider;

  const clientId = resolveOAuthCredential(oauth2Config.clientIdEnvVar, "clientId");
  if (!clientId) {
    const group = ENV_TO_GROUP[oauth2Config.clientIdEnvVar] ?? "unknown";
    return {
      error: `Missing OAuth credentials for ${group}. Set up in Integrations page or set ${oauth2Config.clientIdEnvVar} environment variable.`,
    };
  }

  // Hard cap on outstanding flows. Run a cleanup first so legitimate users
  // aren't blocked by stale entries; if we're still over the cap, reject.
  if (pendingFlows.size >= MAX_PENDING_FLOWS) {
    cleanStalePendingFlows();
    if (pendingFlows.size >= MAX_PENDING_FLOWS) {
      log.warn(
        `Refusing to start OAuth flow: ${pendingFlows.size} pending flows already in-flight (cap ${MAX_PENDING_FLOWS}).`,
      );
      return { error: "too_many_pending_flows" };
    }
  }

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = `http://127.0.0.1:${gatewayPort}/integrations/oauth2/callback`;
  const wantsPkce = oauth2Config.usePkce !== false;
  const pkce = wantsPkce ? generatePkcePair() : null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: oauth2Config.scopes.join(" "),
    state,
    prompt: "consent",
  });
  if (pkce) {
    params.set("code_challenge", pkce.challenge);
    params.set("code_challenge_method", "S256");
  }
  if (oauth2Config.useGoogleOfflineAccess !== false) {
    params.set("access_type", "offline");
  }
  for (const [k, v] of Object.entries(oauth2Config.extraAuthParams ?? {})) {
    params.set(k, v);
  }

  const authUrl = `${oauth2Config.authorizationUrl}?${params.toString()}`;

  pendingFlows.set(state, {
    providerId,
    state,
    createdAt: Date.now(),
    redirectUri,
    codeVerifier: pkce?.verifier ?? null,
  });

  return { authUrl, state };
}

// ── Authorization code exchange ──────────────────────────────────

export async function exchangeOAuthCode(
  state: string,
  code: string,
): Promise<IntegrationConnectionFull | { error: string }> {
  cleanStalePendingFlows();

  const flow = pendingFlows.get(state);
  if (!flow) {
    return { error: "Invalid or expired OAuth state" };
  }
  pendingFlows.delete(state);

  const provider = resolveProviderWithSdk(flow.providerId);
  if (!provider?.oauth2Config) {
    return { error: `No OAuth2 config for provider: ${flow.providerId}` };
  }

  const { oauth2Config } = provider;
  const clientId = resolveOAuthCredential(oauth2Config.clientIdEnvVar, "clientId") ?? "";
  const clientSecret =
    resolveOAuthCredential(oauth2Config.clientSecretEnvVar, "clientSecret") ?? "";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: flow.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (flow.codeVerifier) {
    body.set("code_verifier", flow.codeVerifier);
  }

  const res = await fetch(oauth2Config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Zoom's OAuth app registration distinguishes "PKCE app" from "confidential
    // client app". Apps registered before PKCE was required may return
    // invalid_grant when code_verifier is sent alongside client_secret.
    if (
      flow.providerId === "zoom" &&
      (res.status === 400 || res.status === 401) &&
      text.toLowerCase().includes("invalid_grant")
    ) {
      return {
        error:
          "zoom_pkce_compat: Reconfigure the Zoom OAuth app to allow PKCE, or remove and reconnect this Zoom integration.",
      };
    }
    return { error: `Token exchange failed (${res.status}): ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as Record<string, string | number>;
  const tokens: OAuth2TokenSet = {
    accessToken: String(data.access_token ?? ""),
    refreshToken: String(data.refresh_token ?? ""),
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    tokenType: String(data.token_type ?? "Bearer"),
    scope: String(data.scope ?? oauth2Config.scopes.join(" ")),
  };

  // Fetch user email for label, plus Jira-specific cloudId discovery.
  let accountEmail: string | null = null;
  let connectionConfig: Record<string, unknown> | undefined;
  let connectionLabel: string;

  if (flow.providerId === "jira") {
    const site = await fetchJiraCloudId(tokens.accessToken);
    if (!site) {
      return {
        error:
          "jira_no_accessible_resources: This Atlassian account has no Jira sites accessible to this OAuth app. Add the app to a site, then try again.",
      };
    }
    connectionConfig = {
      cloudId: site.cloudId,
      siteName: site.siteName,
      siteUrl: site.siteUrl,
      baseUrl: `https://api.atlassian.com/ex/jira/${site.cloudId}`,
      authScheme: "Bearer",
    };
    try {
      const me = await fetch(
        `https://api.atlassian.com/ex/jira/${site.cloudId}/rest/api/3/myself`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      );
      if (me.ok) {
        const data = (await me.json()) as { emailAddress?: string };
        accountEmail = data.emailAddress ?? null;
      }
    } catch {
      // Non-critical — label falls back to site name only.
    }
    connectionLabel = accountEmail ? `${site.siteName} — ${accountEmail}` : site.siteName;
  } else {
    accountEmail = await fetchAccountEmail(flow.providerId, tokens.accessToken);
    connectionLabel = accountEmail || provider.name;
  }

  const connectionId = `${flow.providerId}-${crypto.randomBytes(6).toString("hex")}`;
  const connection: IntegrationConnectionFull = {
    id: connectionId,
    providerId: flow.providerId,
    category: provider.category,
    status: "connected",
    label: connectionLabel,
    accountEmail: accountEmail || undefined,
    connectedAt: new Date().toISOString(),
    tokens,
    scopes: oauth2Config.scopes,
    ...(connectionConfig ? { config: connectionConfig } : {}),
  };

  return connection;
}

// ── Token refresh ────────────────────────────────────────────────

export async function refreshTokens(
  providerId: IntegrationProviderId,
  refreshToken: string,
): Promise<OAuth2TokenSet | { error: string }> {
  const provider = resolveProviderWithSdk(providerId);
  if (!provider?.oauth2Config) {
    return { error: `No OAuth2 config for provider: ${providerId}` };
  }

  const { oauth2Config } = provider;
  const clientId = resolveOAuthCredential(oauth2Config.clientIdEnvVar, "clientId") ?? "";
  const clientSecret =
    resolveOAuthCredential(oauth2Config.clientSecretEnvVar, "clientSecret") ?? "";

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(oauth2Config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `Token refresh failed (${res.status}): ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as Record<string, string | number>;
  return {
    accessToken: String(data.access_token ?? ""),
    refreshToken: String(data.refresh_token ?? refreshToken), // Some providers don't return a new refresh token
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    tokenType: String(data.token_type ?? "Bearer"),
    scope: String(data.scope ?? ""),
  };
}

/**
 * Check if tokens need refreshing (within 5 min of expiry) and refresh if needed.
 */
export async function ensureFreshTokens(
  connection: IntegrationConnectionFull,
): Promise<OAuth2TokenSet | { error: string }> {
  const FIVE_MINUTES = 5 * 60 * 1000;
  if (connection.tokens.expiresAt > Date.now() + FIVE_MINUTES) {
    return connection.tokens;
  }
  return refreshTokens(connection.providerId, connection.tokens.refreshToken);
}

// ── Helpers ──────────────────────────────────────────────────────

/** Resolve a provider definition, falling back to SDK registry for OAuth2 providers. */
function resolveProviderWithSdk(
  providerId: IntegrationProviderId,
): IntegrationProviderDefinition | undefined {
  const provider = getProviderDefinition(providerId);
  if (provider?.oauth2Config) {
    return provider;
  }

  const sdkDef = getIntegration(providerId);
  if (sdkDef && sdkDef.auth.type === "oauth2") {
    const sdkAuth = sdkDef.auth;
    return {
      id: sdkDef.id as IntegrationProviderId,
      name: sdkDef.name,
      category: sdkDef.category,
      icon: sdkDef.icon,
      description: sdkDef.description,
      authType: "oauth2",
      capabilities: sdkDef.actions.map((a) => a.name),
      oauth2Config: {
        authorizationUrl: sdkAuth.authorizationUrl,
        tokenUrl: sdkAuth.tokenUrl,
        scopes: sdkAuth.scopes,
        clientIdEnvVar: sdkAuth.clientIdEnvVar,
        clientSecretEnvVar: sdkAuth.clientSecretEnvVar,
        extraAuthParams: sdkAuth.extraAuthParams,
        usePkce: sdkAuth.usePkce,
        useGoogleOfflineAccess: sdkAuth.useGoogleOfflineAccess,
      },
    };
  }
  return provider;
}

async function fetchJiraCloudId(
  accessToken: string,
): Promise<{ cloudId: string; siteName: string; siteUrl: string } | null> {
  try {
    const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) {
      return null;
    }
    const arr = (await res.json()) as Array<{ id: string; name: string; url: string }>;
    if (!Array.isArray(arr) || arr.length === 0) {
      return null;
    }
    return { cloudId: arr[0].id, siteName: arr[0].name, siteUrl: arr[0].url };
  } catch {
    return null;
  }
}

export async function fetchAccountEmail(
  providerId: IntegrationProviderId,
  accessToken: string,
): Promise<string | null> {
  try {
    if (
      providerId === "gmail" ||
      providerId === "google_calendar" ||
      providerId === "google_meet" ||
      providerId === "google_sheets"
    ) {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        return (data.email as string) || null;
      }
    } else if (
      providerId === "outlook_mail" ||
      providerId === "outlook_calendar" ||
      providerId === "ms_teams_meetings"
    ) {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        return (data.mail as string) || (data.userPrincipalName as string) || null;
      }
    } else if (providerId === "zoom") {
      const res = await fetch("https://api.zoom.us/v2/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        return (data.email as string) || null;
      }
    }
  } catch {
    // Non-critical — fall through
  }
  return null;
}
