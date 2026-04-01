/**
 * OAuth2 authorization code flow handler for integrations.
 *
 * Manages the full OAuth lifecycle:
 * 1. Generate authorization URL with state token
 * 2. Exchange authorization code for tokens
 * 3. Refresh tokens before expiry
 */

import crypto from "node:crypto";
import { getIntegration } from "./sdk/registry.js";
import type {
  IntegrationConnectionFull,
  IntegrationProviderDefinition,
  IntegrationProviderId,
  OAuth2TokenSet,
} from "./types.js";
import { getProviderDefinition } from "./types.js";

// ── Pending OAuth flows (in-memory, short-lived) ─────────────────

type PendingOAuthFlow = {
  providerId: IntegrationProviderId;
  state: string;
  createdAt: number;
  redirectUri: string;
};

const pendingFlows = new Map<string, PendingOAuthFlow>();

// Clean up stale flows older than 10 minutes
function cleanStalePendingFlows(): void {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [state, flow] of pendingFlows) {
    if (flow.createdAt < cutoff) {
      pendingFlows.delete(state);
    }
  }
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

  const clientId = process.env[oauth2Config.clientIdEnvVar];
  if (!clientId) {
    return { error: `Missing env var: ${oauth2Config.clientIdEnvVar}` };
  }

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = `http://127.0.0.1:${gatewayPort}/integrations/oauth2/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: oauth2Config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `${oauth2Config.authorizationUrl}?${params.toString()}`;

  pendingFlows.set(state, {
    providerId,
    state,
    createdAt: Date.now(),
    redirectUri,
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
  const clientId = process.env[oauth2Config.clientIdEnvVar] ?? "";
  const clientSecret = process.env[oauth2Config.clientSecretEnvVar] ?? "";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: flow.redirectUri,
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

  // Fetch user email for label
  const accountEmail = await fetchAccountEmail(flow.providerId, tokens.accessToken);

  const connectionId = `${flow.providerId}-${crypto.randomBytes(6).toString("hex")}`;
  const connection: IntegrationConnectionFull = {
    id: connectionId,
    providerId: flow.providerId,
    category: provider.category,
    status: "connected",
    label: accountEmail || provider.name,
    accountEmail: accountEmail || undefined,
    connectedAt: new Date().toISOString(),
    tokens,
    scopes: oauth2Config.scopes,
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
  const clientId = process.env[oauth2Config.clientIdEnvVar] ?? "";
  const clientSecret = process.env[oauth2Config.clientSecretEnvVar] ?? "";

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
      },
    };
  }
  return provider;
}

async function fetchAccountEmail(
  providerId: IntegrationProviderId,
  accessToken: string,
): Promise<string | null> {
  try {
    if (
      providerId === "gmail" ||
      providerId === "google_calendar" ||
      providerId === "google_meet"
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
