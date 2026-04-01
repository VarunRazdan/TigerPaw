/**
 * Tests for the Integration SDK auth bridge.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies before importing the module under test
vi.mock("../../token-store.js", () => ({
  findConnectionByProvider: vi.fn(),
}));

vi.mock("../../oauth2.js", () => ({
  ensureFreshTokens: vi.fn(),
}));

vi.mock("../../../workflows/credentials.js", () => ({
  resolveCredential: vi.fn(),
}));

vi.mock("../registry.js", () => ({
  getIntegration: vi.fn(),
}));

import { resolveCredential } from "../../../workflows/credentials.js";
import { ensureFreshTokens } from "../../oauth2.js";
import { findConnectionByProvider } from "../../token-store.js";
import { createAuthContext } from "../auth-bridge.js";
import { getIntegration } from "../registry.js";
import type { IntegrationDefinition } from "../types.js";

const mockFindConnection = vi.mocked(findConnectionByProvider);
const mockEnsureFreshTokens = vi.mocked(ensureFreshTokens);
const mockResolveCredential = vi.mocked(resolveCredential);
const mockGetIntegration = vi.mocked(getIntegration);

function makeOAuth2Definition(id: string): IntegrationDefinition {
  return {
    id,
    name: `OAuth2 ${id}`,
    description: `OAuth2 integration ${id}`,
    icon: "test",
    category: "testing",
    auth: {
      type: "oauth2",
      authorizationUrl: "https://example.com/auth",
      tokenUrl: "https://example.com/token",
      scopes: ["read"],
      clientIdEnvVar: "CLIENT_ID",
      clientSecretEnvVar: "CLIENT_SECRET",
    },
    actions: [],
    triggers: [],
  };
}

function makeApiKeyDefinition(id: string, envVar?: string): IntegrationDefinition {
  return {
    id,
    name: `ApiKey ${id}`,
    description: `API key integration ${id}`,
    icon: "test",
    category: "testing",
    auth: { type: "api_key", envVar },
    actions: [],
    triggers: [],
  };
}

function makeNoneAuthDefinition(id: string): IntegrationDefinition {
  return {
    id,
    name: `None ${id}`,
    description: `No-auth integration ${id}`,
    icon: "test",
    category: "testing",
    auth: { type: "none" },
    actions: [],
    triggers: [],
  };
}

describe("Auth Bridge — createAuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── OAuth2 path ────────────────────────────────────────────────

  describe("OAuth2 auth", () => {
    it("returns AuthContext with fresh access token when connection exists", async () => {
      const def = makeOAuth2Definition("slack");
      mockGetIntegration.mockReturnValue(def);

      const fakeConnection = {
        id: "conn-1",
        providerId: "slack" as const,
        tokens: {
          accessToken: "fresh-access-token",
          refreshToken: "refresh-tok",
          expiresAt: Date.now() + 3600_000,
        },
      };
      mockFindConnection.mockReturnValue(fakeConnection as never);
      mockEnsureFreshTokens.mockResolvedValue({
        accessToken: "fresh-access-token",
        refreshToken: "refresh-tok",
        expiresAt: Date.now() + 3600_000,
      } as never);

      const ctx = await createAuthContext("slack");

      expect(ctx).toBeDefined();
      expect(ctx.getCredentialField("anything")).toBeUndefined();
      expect(ctx.credentials).toEqual({});

      // getAccessToken should call findConnectionByProvider + ensureFreshTokens again
      const token = await ctx.getAccessToken();
      expect(token).toBe("fresh-access-token");
      // Initial creation calls findConnection + ensureFresh once,
      // then getAccessToken calls them again
      expect(mockFindConnection).toHaveBeenCalledWith("slack");
      expect(mockEnsureFreshTokens).toHaveBeenCalled();
    });

    it("throws when no OAuth2 connection is found", async () => {
      const def = makeOAuth2Definition("slack");
      mockGetIntegration.mockReturnValue(def);
      mockFindConnection.mockReturnValue(null as never);

      await expect(createAuthContext("slack")).rejects.toThrow(
        'No OAuth2 connection found for "slack"',
      );
    });

    it("throws when token refresh fails", async () => {
      const def = makeOAuth2Definition("slack");
      mockGetIntegration.mockReturnValue(def);

      const fakeConnection = {
        id: "conn-1",
        providerId: "slack" as const,
        tokens: {
          accessToken: "expired-token",
          refreshToken: "refresh-tok",
          expiresAt: Date.now() - 1000, // expired
        },
      };
      mockFindConnection.mockReturnValue(fakeConnection as never);
      mockEnsureFreshTokens.mockResolvedValue({
        error: "refresh_token_expired",
      } as never);

      await expect(createAuthContext("slack")).rejects.toThrow(
        'OAuth2 token refresh failed for "slack"',
      );
    });
  });

  // ── API key path ───────────────────────────────────────────────

  describe("API key auth", () => {
    it("returns AuthContext with apiKey from credential vault", async () => {
      const def = makeApiKeyDefinition("github", "GITHUB_TOKEN");
      mockGetIntegration.mockReturnValue(def);
      mockResolveCredential.mockReturnValue({ apiKey: "vault-api-key-123" });

      const ctx = await createAuthContext("github", "cred-42");

      const token = await ctx.getAccessToken();
      expect(token).toBe("vault-api-key-123");
      expect(mockResolveCredential).toHaveBeenCalledWith("cred-42");
      expect(ctx.getCredentialField("apiKey")).toBe("vault-api-key-123");
      expect(ctx.credentials).toEqual({ apiKey: "vault-api-key-123" });
    });

    it("falls back to environment variable when no credential found", async () => {
      const def = makeApiKeyDefinition("github", "GITHUB_TOKEN");
      mockGetIntegration.mockReturnValue(def);
      mockResolveCredential.mockReturnValue(null);

      // Set env var for fallback
      process.env.GITHUB_TOKEN = "env-token-456";

      const ctx = await createAuthContext("github", "missing-cred");

      const token = await ctx.getAccessToken();
      expect(token).toBe("env-token-456");

      delete process.env.GITHUB_TOKEN;
    });

    it("falls back to env var when credential has no apiKey field", async () => {
      const def = makeApiKeyDefinition("github", "GITHUB_TOKEN");
      mockGetIntegration.mockReturnValue(def);
      mockResolveCredential.mockReturnValue({ username: "user" });

      process.env.GITHUB_TOKEN = "env-fallback-token";

      const ctx = await createAuthContext("github", "cred-99");

      const token = await ctx.getAccessToken();
      expect(token).toBe("env-fallback-token");

      delete process.env.GITHUB_TOKEN;
    });

    it("throws from getAccessToken when no key is available at all", async () => {
      const def = makeApiKeyDefinition("github"); // no envVar
      mockGetIntegration.mockReturnValue(def);
      mockResolveCredential.mockReturnValue(null);

      const ctx = await createAuthContext("github", "missing-cred");

      await expect(ctx.getAccessToken()).rejects.toThrow(
        "No API key or token found in credentials",
      );
    });
  });

  // ── None auth ──────────────────────────────────────────────────

  describe("None auth", () => {
    it("returns a stub context with empty token", async () => {
      const def = makeNoneAuthDefinition("http");
      mockGetIntegration.mockReturnValue(def);

      const ctx = await createAuthContext("http");

      const token = await ctx.getAccessToken();
      expect(token).toBe("");
      expect(ctx.getCredentialField("anything")).toBeUndefined();
      expect(ctx.credentials).toEqual({});
    });
  });

  // ── Unknown integration ────────────────────────────────────────

  describe("Unknown integration", () => {
    it("returns a stub context when integration is not registered", async () => {
      mockGetIntegration.mockReturnValue(undefined);

      const ctx = await createAuthContext("nonexistent");

      const token = await ctx.getAccessToken();
      expect(token).toBe("");
      expect(ctx.getCredentialField("key")).toBeUndefined();
      expect(ctx.credentials).toEqual({});
    });
  });
});
