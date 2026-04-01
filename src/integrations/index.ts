/**
 * Integration service — orchestrates connections to email, calendar,
 * and meeting providers.
 *
 * Follows the same singleton pattern as WorkflowService.
 */

import { ensureFreshTokens, exchangeOAuthCode, startOAuthFlow } from "./oauth2.js";
import { listIntegrations } from "./sdk/registry.js";
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
import { INTEGRATION_PROVIDERS } from "./types.js";

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
    // Strip tokens before returning
    const { tokens: _tokens, config: _config, ...connection } = full;
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
      const { tokens: _t, config: _c, ...connection } = updated;
      return connection;
    }

    // Save new connection
    saveIntegrationConnection(result);
    const { tokens: _t, config: _c, ...connection } = result;
    return connection;
  }

  async disconnect(connectionId: string): Promise<boolean> {
    return deleteIntegrationConnection(connectionId);
  }

  // ── Token access (server-side only) ──────────────────────────

  /**
   * Get a fresh access token for an integration connection.
   * Automatically refreshes expired tokens.
   */
  async getAccessToken(connectionId: string): Promise<string | { error: string }> {
    const conn = getIntegrationConnection(connectionId);
    if (!conn) {
      return { error: "Connection not found" };
    }

    const result = await ensureFreshTokens(conn);
    if ("error" in result) {
      // Mark connection as expired
      saveIntegrationConnection({ ...conn, status: "expired" });
      return result;
    }

    // Update stored tokens if they changed
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
