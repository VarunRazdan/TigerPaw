/**
 * Integration service — orchestrates connections to email, calendar,
 * and meeting providers.
 *
 * Follows the same singleton pattern as WorkflowService.
 */

import crypto from "node:crypto";
import {
  ensureFreshTokens,
  exchangeOAuthCode,
  fetchAccountEmail,
  startOAuthFlow,
} from "./oauth2.js";
import { listIntegrations } from "./sdk/registry.js";
import {
  evictTokenCache,
  mintServiceAccountToken,
  parseServiceAccountJson,
} from "./service-account.js";
import {
  deleteIntegrationConnection,
  findConnectionByProvider,
  getIntegrationConnection,
  listIntegrationConnections,
  saveIntegrationConnection,
  updateIntegrationTokens,
} from "./token-store.js";
// Register all SDK providers on first import
import "./sdk/providers/index.js";
import type {
  IntegrationConnection,
  IntegrationConnectionFull,
  IntegrationProviderDefinition,
  IntegrationProviderId,
} from "./types.js";
import { GOOGLE_PROVIDER_IDS, INTEGRATION_PROVIDERS } from "./types.js";

export class IntegrationService {
  private gatewayPort: number;

  constructor(gatewayPort: number) {
    this.gatewayPort = gatewayPort;
  }

  // ── Provider listing ─────────────────────────────────────────

  listProviders(): IntegrationProviderDefinition[] {
    const sdkProviders: IntegrationProviderDefinition[] = listIntegrations().map((def) => ({
      id: def.id as IntegrationProviderId,
      name: def.name,
      category: def.category,
      icon: def.icon,
      description: def.description,
      authType: def.auth.type,
      capabilities: [...def.actions.map((a) => a.name), ...def.triggers.map((t) => t.name)],
      ...(def.auth.type === "oauth2"
        ? {
            oauth2Config: {
              authorizationUrl: def.auth.authorizationUrl,
              tokenUrl: def.auth.tokenUrl,
              scopes: def.auth.scopes,
              clientIdEnvVar: def.auth.clientIdEnvVar,
              clientSecretEnvVar: def.auth.clientSecretEnvVar,
            },
          }
        : {}),
    }));
    return [...INTEGRATION_PROVIDERS, ...sdkProviders];
  }

  // ── Connection management ────────────────────────────────────

  listConnections(): IntegrationConnection[] {
    return listIntegrationConnections();
  }

  getConnection(id: string): IntegrationConnection | null {
    const full = getIntegrationConnection(id);
    if (!full) {
      return null;
    }
    // Strip sensitive fields before returning
    const { tokens: _tokens, config: _config, serviceAccount: _sa, ...connection } = full;
    return connection;
  }

  // ── OAuth2 flow ──────────────────────────────────────────────

  startOAuth(providerId: IntegrationProviderId) {
    return startOAuthFlow(providerId, this.gatewayPort);
  }

  async completeOAuth(
    state: string,
    code: string,
  ): Promise<IntegrationConnection | { error: string }> {
    const result = await exchangeOAuthCode(state, code);
    if ("error" in result) {
      return result;
    }

    // Check if a connection for this provider already exists
    const existing = findConnectionByProvider(result.providerId);
    if (existing) {
      // Update existing connection with new tokens
      const updated: IntegrationConnectionFull = {
        ...existing,
        tokens: result.tokens,
        status: "connected",
        label: result.label,
        accountEmail: result.accountEmail,
        lastUsedAt: new Date().toISOString(),
        scopes: result.scopes,
      };
      saveIntegrationConnection(updated);
      const { tokens: _t, config: _c, serviceAccount: _sa, ...connection } = updated;
      return connection;
    }

    // Save new connection
    saveIntegrationConnection(result);
    const { tokens: _t, config: _c, serviceAccount: _sa, ...connection } = result;
    return connection;
  }

  async disconnect(connectionId: string): Promise<boolean> {
    const conn = getIntegrationConnection(connectionId);
    if (conn?.authMethod === "service_account" && conn.serviceAccount) {
      evictTokenCache(conn.serviceAccount);
    }
    return deleteIntegrationConnection(connectionId);
  }

  // ── Service account flow ─────────────────────────────────────

  async connectServiceAccount(
    providerId: IntegrationProviderId,
    serviceAccountJson: string,
    impersonateEmail: string,
  ): Promise<IntegrationConnection | { error: string }> {
    const provider = this.listProviders().find((p) => p.id === providerId);
    if (!provider) {
      return { error: `Unknown provider: ${providerId}` };
    }
    const isGoogle =
      GOOGLE_PROVIDER_IDS.has(providerId) ||
      provider.oauth2Config?.clientIdEnvVar === "GOOGLE_CLIENT_ID";
    if (!isGoogle) {
      return { error: "Service account auth is only supported for Google providers" };
    }

    const parsed = parseServiceAccountJson(serviceAccountJson);
    if (!parsed.ok) {
      return { error: parsed.error };
    }

    const scopes = provider.oauth2Config?.scopes ?? [];
    const saConfig = {
      clientEmail: parsed.clientEmail,
      privateKey: parsed.privateKey,
      impersonateEmail,
      scopes,
    };

    // Validate credentials by minting a token
    const mintResult = await mintServiceAccountToken(saConfig);
    if ("error" in mintResult) {
      return { error: mintResult.error };
    }

    // Fetch account email for label
    const accountEmail = await fetchAccountEmail(providerId, mintResult.accessToken);

    // Reuse existing connection ID if updating
    const existing = findConnectionByProvider(providerId);
    const connectionId = existing?.id ?? `${providerId}-${crypto.randomBytes(6).toString("hex")}`;

    const connection: IntegrationConnectionFull = {
      id: connectionId,
      providerId,
      category: provider.category,
      status: "connected",
      label: accountEmail || impersonateEmail || parsed.clientEmail,
      accountEmail: accountEmail || impersonateEmail || undefined,
      authMethod: "service_account",
      connectedAt: existing?.connectedAt ?? new Date().toISOString(),
      scopes,
      tokens: {
        accessToken: mintResult.accessToken,
        refreshToken: "",
        expiresAt: mintResult.expiresAt,
        tokenType: "Bearer",
        scope: scopes.join(" "),
      },
      serviceAccount: saConfig,
    };

    saveIntegrationConnection(connection);
    const { tokens: _t, config: _c, serviceAccount: _sa, ...stripped } = connection;
    return stripped;
  }

  // ── Token access (server-side only) ──────────────────────────

  /**
   * Get a fresh access token for an integration connection.
   * Branches on authMethod to support OAuth2 and service account connections.
   */
  async getAccessToken(connectionId: string): Promise<string | { error: string }> {
    const conn = getIntegrationConnection(connectionId);
    if (!conn) {
      return { error: "Connection not found" };
    }

    // Service account path — mint a fresh token on demand
    if (conn.authMethod === "service_account" && conn.serviceAccount) {
      const result = await mintServiceAccountToken(conn.serviceAccount);
      if ("error" in result) {
        saveIntegrationConnection({ ...conn, status: "error" });
        return result;
      }
      if (result.accessToken !== conn.tokens.accessToken) {
        updateIntegrationTokens(connectionId, {
          accessToken: result.accessToken,
          refreshToken: "",
          expiresAt: result.expiresAt,
          tokenType: "Bearer",
          scope: conn.tokens.scope,
        });
      }
      return result.accessToken;
    }

    // OAuth2 path (default)
    const result = await ensureFreshTokens(conn);
    if ("error" in result) {
      saveIntegrationConnection({ ...conn, status: "expired" });
      return result;
    }

    if (result.accessToken !== conn.tokens.accessToken) {
      updateIntegrationTokens(connectionId, result);
    }

    return result.accessToken;
  }

  /**
   * Get a fresh access token by provider ID.
   */
  async getAccessTokenByProvider(
    providerId: IntegrationProviderId,
  ): Promise<string | { error: string }> {
    const conn = findConnectionByProvider(providerId);
    if (!conn) {
      return { error: `No connection for provider: ${providerId}` };
    }
    return this.getAccessToken(conn.id);
  }

  // ── Health check ─────────────────────────────────────────────

  async testConnection(connectionId: string): Promise<{ ok: boolean; error?: string }> {
    const tokenResult = await this.getAccessToken(connectionId);
    if (typeof tokenResult !== "string") {
      return { ok: false, error: tokenResult.error };
    }
    return { ok: true };
  }
}

// ── Singleton ──────────────────────────────────────────────────

let _instance: IntegrationService | null = null;

export function getIntegrationService(gatewayPort?: number): IntegrationService {
  if (!_instance) {
    _instance = new IntegrationService(gatewayPort ?? 18789);
  }
  return _instance;
}
