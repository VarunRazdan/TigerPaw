/**
 * Integration token storage — thin wrapper over the credential vault.
 *
 * OAuth2 tokens are stored as encrypted credentials with type "oauth2_integration".
 * This module provides typed helpers for integration-specific token operations.
 */

import {
  deleteCredential,
  getCredential,
  listCredentials,
  saveCredential,
} from "../workflows/credentials.js";
import type {
  IntegrationConnection,
  IntegrationConnectionFull,
  IntegrationProviderId,
  OAuth2TokenSet,
} from "./types.js";

const CREDENTIAL_TYPE = "oauth2_integration";

function connectionToCredentialFields(conn: IntegrationConnectionFull): Record<string, string> {
  return {
    providerId: conn.providerId,
    category: conn.category,
    label: conn.label,
    accountEmail: conn.accountEmail ?? "",
    status: conn.status,
    connectedAt: conn.connectedAt,
    lastUsedAt: conn.lastUsedAt ?? "",
    accessToken: conn.tokens.accessToken,
    refreshToken: conn.tokens.refreshToken,
    expiresAt: String(conn.tokens.expiresAt),
    tokenType: conn.tokens.tokenType,
    scope: conn.tokens.scope,
  };
}

function credentialFieldsToConnection(
  id: string,
  name: string,
  fields: Record<string, string>,
): IntegrationConnectionFull {
  return {
    id,
    providerId: fields.providerId as IntegrationProviderId,
    category: fields.category as IntegrationConnectionFull["category"],
    status: (fields.status ?? "connected") as IntegrationConnectionFull["status"],
    label: fields.label ?? name,
    accountEmail: fields.accountEmail || undefined,
    connectedAt: fields.connectedAt ?? new Date().toISOString(),
    lastUsedAt: fields.lastUsedAt || undefined,
    tokens: {
      accessToken: fields.accessToken ?? "",
      refreshToken: fields.refreshToken ?? "",
      expiresAt: Number(fields.expiresAt) || 0,
      tokenType: fields.tokenType ?? "Bearer",
      scope: fields.scope ?? "",
    },
  };
}

// ── Public API ───────────────────────────────────────────────────

/**
 * List all integration connections (tokens are NOT included).
 */
export function listIntegrationConnections(): IntegrationConnection[] {
  const all = listCredentials();
  return all
    .filter((c) => c.type === CREDENTIAL_TYPE)
    .map((c) => ({
      id: c.id,
      providerId: c.fieldKeys.includes("providerId")
        ? (getCredential(c.id)?.fields.providerId as IntegrationProviderId)
        : ("gmail" as IntegrationProviderId),
      category: (getCredential(c.id)?.fields.category ??
        "email") as IntegrationConnection["category"],
      status: (getCredential(c.id)?.fields.status ??
        "connected") as IntegrationConnection["status"],
      label: c.name,
      accountEmail: getCredential(c.id)?.fields.accountEmail || undefined,
      connectedAt: c.createdAt,
      lastUsedAt: c.updatedAt,
    }));
}

/**
 * Get a full connection including tokens (for server-side use only).
 */
export function getIntegrationConnection(id: string): IntegrationConnectionFull | null {
  const cred = getCredential(id);
  if (!cred || cred.type !== CREDENTIAL_TYPE) {
    return null;
  }
  return credentialFieldsToConnection(cred.id, cred.name, cred.fields);
}

/**
 * Save or update an integration connection with tokens.
 */
export function saveIntegrationConnection(conn: IntegrationConnectionFull): void {
  const now = new Date().toISOString();
  saveCredential({
    id: conn.id,
    name: conn.label,
    type: CREDENTIAL_TYPE,
    fields: connectionToCredentialFields(conn),
    createdAt: conn.connectedAt ?? now,
    updatedAt: now,
  });
}

/**
 * Update only the tokens for an existing connection (e.g. after refresh).
 */
export function updateIntegrationTokens(id: string, tokens: OAuth2TokenSet): void {
  const existing = getIntegrationConnection(id);
  if (!existing) {
    return;
  }
  saveIntegrationConnection({
    ...existing,
    tokens,
    lastUsedAt: new Date().toISOString(),
  });
}

/**
 * Remove an integration connection.
 */
export function deleteIntegrationConnection(id: string): boolean {
  return deleteCredential(id);
}

/**
 * Find a connection by provider ID (returns first match).
 */
export function findConnectionByProvider(
  providerId: IntegrationProviderId,
): IntegrationConnectionFull | null {
  const all = listCredentials();
  for (const c of all) {
    if (c.type !== CREDENTIAL_TYPE) {
      continue;
    }
    const full = getIntegrationConnection(c.id);
    if (full && full.providerId === providerId) {
      return full;
    }
  }
  return null;
}
