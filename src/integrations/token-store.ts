/**
 * Integration token storage — thin wrapper over the credential vault.
 *
 * OAuth2 tokens are stored as encrypted credentials with type "oauth2_integration".
 * This module provides typed helpers for integration-specific token operations.
 */

import { dalFindByType } from "../dal/credentials.js";
import { deleteCredential, getCredential, saveCredential } from "../workflows/credentials.js";
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
 * Uses DAL type-filtered query for efficiency instead of scanning all credentials.
 */
export function listIntegrationConnections(): IntegrationConnection[] {
  const integrationCreds = dalFindByType(CREDENTIAL_TYPE);
  return integrationCreds.map((c) => {
    const conn = credentialFieldsToConnection(c.id, c.name, c.fields);
    return {
      id: conn.id,
      providerId: conn.providerId,
      category: conn.category,
      status: conn.status,
      label: conn.label,
      accountEmail: conn.accountEmail,
      connectedAt: c.createdAt,
      lastUsedAt: c.updatedAt,
    };
  });
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
 * Uses DAL type-filtered query — O(1) with SQLite index vs O(n) file scan.
 */
export function findConnectionByProvider(
  providerId: IntegrationProviderId,
): IntegrationConnectionFull | null {
  const integrationCreds = dalFindByType(CREDENTIAL_TYPE);
  for (const c of integrationCreds) {
    const conn = credentialFieldsToConnection(c.id, c.name, c.fields);
    if (conn.providerId === providerId) {
      return conn;
    }
  }
  return null;
}
