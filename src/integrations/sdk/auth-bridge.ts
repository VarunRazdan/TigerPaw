/**
 * Auth Bridge — creates AuthContext objects for SDK integrations.
 *
 * Bridges two auth mechanisms:
 * - OAuth2: uses existing token store + refresh flow
 * - API key / bearer / basic: uses the credential vault
 */

import { resolveCredential } from "../../workflows/credentials.js";
import { ensureFreshTokens } from "../oauth2.js";
import { findConnectionByProvider } from "../token-store.js";
import type { IntegrationProviderId } from "../types.js";
import { getIntegration } from "./registry.js";
import type { AuthContext } from "./types.js";

/**
 * Create an AuthContext for an SDK integration.
 *
 * For OAuth2 integrations, looks up the connection by provider ID and
 * auto-refreshes tokens. For API key integrations, reads from the
 * credential vault using the provided credentialId.
 *
 * @param integrationId - The SDK integration ID (e.g. "slack", "github")
 * @param credentialId  - Optional credential vault ID (for api_key/bearer/basic)
 */
export async function createAuthContext(
  integrationId: string,
  credentialId?: string,
): Promise<AuthContext> {
  const def = getIntegration(integrationId);
  if (!def) {
    return stubAuthContext();
  }

  switch (def.auth.type) {
    case "oauth2":
      return createOAuth2AuthContext(integrationId);
    case "api_key":
    case "bearer_token":
    case "basic_auth":
      return createCredentialAuthContext(
        credentialId,
        def.auth.type === "api_key" ? def.auth.envVar : undefined,
      );
    case "none":
    default:
      return stubAuthContext();
  }
}

/** OAuth2: find existing connection, refresh if needed, wrap as AuthContext. */
async function createOAuth2AuthContext(integrationId: string): Promise<AuthContext> {
  const connection = findConnectionByProvider(integrationId as IntegrationProviderId);
  if (!connection) {
    throw new Error(
      `No OAuth2 connection found for "${integrationId}". ` +
        `Connect the integration first via Settings > Integrations.`,
    );
  }

  // Ensure tokens are fresh (refreshes if within 5 min of expiry)
  const tokens = await ensureFreshTokens(connection);
  if ("error" in tokens) {
    throw new Error(`OAuth2 token refresh failed for "${integrationId}": ${tokens.error}`);
  }

  return {
    getAccessToken: async () => {
      // Re-check freshness on each call in case the context is long-lived
      const conn = findConnectionByProvider(integrationId as IntegrationProviderId);
      if (!conn) {
        throw new Error(`Connection lost for "${integrationId}"`);
      }
      const fresh = await ensureFreshTokens(conn);
      if ("error" in fresh) {
        throw new Error(fresh.error);
      }
      return fresh.accessToken;
    },
    getCredentialField: () => undefined,
    credentials: {},
  };
}

/** API key / bearer / basic: read from credential vault. */
function createCredentialAuthContext(credentialId?: string, envVar?: string): AuthContext {
  let fields: Record<string, string> = {};

  if (credentialId) {
    const resolved = resolveCredential(credentialId);
    if (resolved) {
      fields = resolved;
    }
  }

  // Fallback to environment variable if credential vault is empty
  if (!fields.apiKey && envVar) {
    const envValue = process.env[envVar];
    if (envValue) {
      fields = { apiKey: envValue };
    }
  }

  return {
    getAccessToken: async () => {
      const key = fields.apiKey ?? fields.token ?? fields.accessToken ?? "";
      if (!key) {
        throw new Error("No API key or token found in credentials");
      }
      return key;
    },
    getCredentialField: (key: string) => fields[key],
    credentials: fields,
  };
}

/** Stub context for auth-less integrations. */
function stubAuthContext(): AuthContext {
  return {
    getAccessToken: async () => "",
    getCredentialField: () => undefined,
    credentials: {},
  };
}
