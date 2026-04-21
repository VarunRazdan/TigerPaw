/**
 * Tests for IntegrationService — service account orchestration paths.
 *
 * Covers connectServiceAccount(), getAccessToken() SA branch, and
 * disconnect() with SA connections.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all dependencies before importing the module under test ──

vi.mock("../service-account.js", () => ({
  parseServiceAccountJson: vi.fn(),
  mintServiceAccountToken: vi.fn(),
  evictTokenCache: vi.fn(),
  clearTokenCache: vi.fn(),
}));

vi.mock("../oauth2.js", () => ({
  startOAuthFlow: vi.fn(),
  exchangeOAuthCode: vi.fn(),
  fetchAccountEmail: vi.fn(),
  ensureFreshTokens: vi.fn(),
}));

vi.mock("../token-store.js", () => ({
  findConnectionByProvider: vi.fn(),
  saveIntegrationConnection: vi.fn(),
  getIntegrationConnection: vi.fn(),
  listIntegrationConnections: vi.fn(() => []),
  deleteIntegrationConnection: vi.fn(),
  updateIntegrationTokens: vi.fn(),
}));

vi.mock("../sdk/registry.js", () => ({
  listIntegrations: vi.fn(() => []),
}));

// Prevent SDK provider auto-registration from running
vi.mock("../sdk/providers/index.js", () => ({}));

import { IntegrationService } from "../index.js";
import { fetchAccountEmail, ensureFreshTokens } from "../oauth2.js";
import {
  parseServiceAccountJson,
  mintServiceAccountToken,
  evictTokenCache,
} from "../service-account.js";
import {
  findConnectionByProvider,
  saveIntegrationConnection,
  getIntegrationConnection,
  deleteIntegrationConnection,
  updateIntegrationTokens,
} from "../token-store.js";
import type { IntegrationConnectionFull } from "../types.js";

const mockParseSA = vi.mocked(parseServiceAccountJson);
const mockMintSA = vi.mocked(mintServiceAccountToken);
const mockEvictCache = vi.mocked(evictTokenCache);
const mockFetchEmail = vi.mocked(fetchAccountEmail);
const mockFindByProvider = vi.mocked(findConnectionByProvider);
const mockSaveConnection = vi.mocked(saveIntegrationConnection);
const mockGetConnection = vi.mocked(getIntegrationConnection);
const mockDeleteConnection = vi.mocked(deleteIntegrationConnection);
const mockUpdateTokens = vi.mocked(updateIntegrationTokens);
const mockEnsureFresh = vi.mocked(ensureFreshTokens);

// ── Fixtures ──────────────────────────────────────────────────────

const VALID_SA_JSON = JSON.stringify({
  type: "service_account",
  client_email: "sa@project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
});

function makeService(): IntegrationService {
  return new IntegrationService(18789);
}

// ── connectServiceAccount ─────────────────────────────────────────

describe("IntegrationService.connectServiceAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: parses JSON, mints token, fetches email, saves connection", async () => {
    const svc = makeService();

    mockParseSA.mockReturnValue({
      ok: true,
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
      tokenUri: "https://oauth2.googleapis.com/token",
    });
    mockMintSA.mockResolvedValue({
      accessToken: "minted-token-abc",
      expiresAt: Date.now() + 3600_000,
    });
    mockFetchEmail.mockResolvedValue("admin@example.com");
    mockFindByProvider.mockReturnValue(null);

    const result = await svc.connectServiceAccount("gmail", VALID_SA_JSON, "admin@example.com");

    // Should return a stripped connection (no tokens, no serviceAccount, no config)
    expect(result).not.toHaveProperty("tokens");
    expect(result).not.toHaveProperty("serviceAccount");
    expect(result).not.toHaveProperty("config");

    expect(result).toHaveProperty("providerId", "gmail");
    expect(result).toHaveProperty("status", "connected");
    expect(result).toHaveProperty("authMethod", "service_account");
    expect(result).toHaveProperty("label", "admin@example.com");

    // Verify saveIntegrationConnection was called with full data
    expect(mockSaveConnection).toHaveBeenCalledTimes(1);
    const savedConn = mockSaveConnection.mock.calls[0][0];
    expect(savedConn.serviceAccount).toEqual({
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
      impersonateEmail: "admin@example.com",
      scopes: expect.any(Array),
    });
    expect(savedConn.tokens.accessToken).toBe("minted-token-abc");
  });

  it("returns error when JSON parsing fails", async () => {
    const svc = makeService();

    mockParseSA.mockReturnValue({
      ok: false,
      error: "Invalid JSON",
    });

    const result = await svc.connectServiceAccount("gmail", "not-json", "admin@example.com");

    expect(result).toEqual({ error: "Invalid JSON" });
    expect(mockMintSA).not.toHaveBeenCalled();
    expect(mockSaveConnection).not.toHaveBeenCalled();
  });

  it("returns error when token minting fails", async () => {
    const svc = makeService();

    mockParseSA.mockReturnValue({
      ok: true,
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      tokenUri: "https://oauth2.googleapis.com/token",
    });
    mockMintSA.mockResolvedValue({
      error: "Invalid private key: bad format",
    });

    const result = await svc.connectServiceAccount("gmail", VALID_SA_JSON, "admin@example.com");

    expect(result).toEqual({ error: "Invalid private key: bad format" });
    expect(mockSaveConnection).not.toHaveBeenCalled();
  });

  it("rejects non-Google providers", async () => {
    const svc = makeService();

    const result = await svc.connectServiceAccount(
      "outlook_mail",
      VALID_SA_JSON,
      "admin@example.com",
    );

    expect(result).toEqual({
      error: "Service account auth is only supported for Google providers",
    });
    expect(mockParseSA).not.toHaveBeenCalled();
  });

  it("accepts google_sheets provider (SDK-registered, in GOOGLE_PROVIDER_IDS)", async () => {
    // google_sheets is in GOOGLE_PROVIDER_IDS but only registered via SDK
    // The service resolves it through listProviders() which merges SDK providers
    const svc = makeService();

    // google_sheets is not in INTEGRATION_PROVIDERS, but IS in GOOGLE_PROVIDER_IDS set.
    // The provider lookup will fail (not found in listProviders without SDK loaded),
    // but the GOOGLE_PROVIDER_IDS check happens after provider lookup.
    // So we need the provider to be found. Let's mock listIntegrations to include it.
    const { listIntegrations } = await import("../sdk/registry.js");
    vi.mocked(listIntegrations).mockReturnValue([
      {
        id: "google_sheets",
        name: "Google Sheets",
        description: "Spreadsheet integration",
        icon: "google-sheets",
        category: "productivity",
        auth: {
          type: "oauth2",
          authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl: "https://oauth2.googleapis.com/token",
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
          clientIdEnvVar: "GOOGLE_CLIENT_ID",
          clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
        },
        actions: [],
        triggers: [],
      },
    ]);

    mockParseSA.mockReturnValue({
      ok: true,
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      tokenUri: "https://oauth2.googleapis.com/token",
    });
    mockMintSA.mockResolvedValue({
      accessToken: "sheets-token",
      expiresAt: Date.now() + 3600_000,
    });
    mockFetchEmail.mockResolvedValue(null);
    mockFindByProvider.mockReturnValue(null);

    const result = await svc.connectServiceAccount(
      "google_sheets",
      VALID_SA_JSON,
      "admin@example.com",
    );

    expect(result).not.toHaveProperty("error");
    expect(result).toHaveProperty("providerId", "google_sheets");
    expect(result).toHaveProperty("authMethod", "service_account");
  });

  it("updates existing connection instead of creating new one", async () => {
    const svc = makeService();

    const existingConn = {
      id: "gmail-existing123",
      providerId: "gmail" as const,
      category: "email" as const,
      status: "connected" as const,
      label: "old-label",
      connectedAt: "2025-01-01T00:00:00.000Z",
      tokens: {
        accessToken: "old-token",
        refreshToken: "",
        expiresAt: 0,
        tokenType: "Bearer",
        scope: "",
      },
    };

    mockParseSA.mockReturnValue({
      ok: true,
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      tokenUri: "https://oauth2.googleapis.com/token",
    });
    mockMintSA.mockResolvedValue({
      accessToken: "new-minted-token",
      expiresAt: Date.now() + 3600_000,
    });
    mockFetchEmail.mockResolvedValue("updated@example.com");
    mockFindByProvider.mockReturnValue(existingConn as IntegrationConnectionFull);

    const result = await svc.connectServiceAccount("gmail", VALID_SA_JSON, "admin@example.com");

    expect(result).toHaveProperty("id", "gmail-existing123");
    expect(result).toHaveProperty("label", "updated@example.com");

    // Should preserve original connectedAt
    const saved = mockSaveConnection.mock.calls[0][0];
    expect(saved.connectedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(saved.id).toBe("gmail-existing123");
  });

  it("falls back to impersonateEmail then clientEmail for label when fetchAccountEmail returns null", async () => {
    const svc = makeService();

    mockParseSA.mockReturnValue({
      ok: true,
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      tokenUri: "https://oauth2.googleapis.com/token",
    });
    mockMintSA.mockResolvedValue({
      accessToken: "token",
      expiresAt: Date.now() + 3600_000,
    });
    mockFetchEmail.mockResolvedValue(null);
    mockFindByProvider.mockReturnValue(null);

    const result = await svc.connectServiceAccount("gmail", VALID_SA_JSON, "delegated@example.com");

    // accountEmail fallback: null || impersonateEmail || clientEmail
    expect(result).toHaveProperty("label", "delegated@example.com");
  });

  it("returns error for unknown provider ID", async () => {
    const svc = makeService();

    const result = await svc.connectServiceAccount(
      "nonexistent_provider" as unknown as import("../../types.js").IntegrationProviderId,
      VALID_SA_JSON,
      "admin@example.com",
    );

    expect(result).toEqual({ error: "Unknown provider: nonexistent_provider" });
  });
});

// ── getAccessToken (SA branch) ────────────────────────────────────

describe("IntegrationService.getAccessToken — service account branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a fresh token and returns it for SA connections", async () => {
    const svc = makeService();

    const saConfig = {
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      impersonateEmail: "admin@example.com",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    };

    mockGetConnection.mockReturnValue({
      id: "gmail-sa-001",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "admin@example.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      authMethod: "service_account",
      serviceAccount: saConfig,
      tokens: {
        accessToken: "old-cached-token",
        refreshToken: "",
        expiresAt: Date.now() + 3600_000,
        tokenType: "Bearer",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
      },
    } as IntegrationConnectionFull);

    mockMintSA.mockResolvedValue({
      accessToken: "freshly-minted-token",
      expiresAt: Date.now() + 3600_000,
    });

    const result = await svc.getAccessToken("gmail-sa-001");

    expect(result).toBe("freshly-minted-token");
    expect(mockMintSA).toHaveBeenCalledWith(saConfig);
    // Should NOT call ensureFreshTokens (OAuth2 path)
    expect(mockEnsureFresh).not.toHaveBeenCalled();
  });

  it("updates stored tokens when minted token differs from stored", async () => {
    const svc = makeService();

    const saConfig = {
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      impersonateEmail: "admin@example.com",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    };

    const storedToken = "stored-old-token";
    const newExpiresAt = Date.now() + 3600_000;

    mockGetConnection.mockReturnValue({
      id: "gmail-sa-001",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "admin@example.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      authMethod: "service_account",
      serviceAccount: saConfig,
      tokens: {
        accessToken: storedToken,
        refreshToken: "",
        expiresAt: Date.now() - 1000, // expired
        tokenType: "Bearer",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
      },
    } as IntegrationConnectionFull);

    mockMintSA.mockResolvedValue({
      accessToken: "brand-new-token",
      expiresAt: newExpiresAt,
    });

    await svc.getAccessToken("gmail-sa-001");

    expect(mockUpdateTokens).toHaveBeenCalledWith("gmail-sa-001", {
      accessToken: "brand-new-token",
      refreshToken: "",
      expiresAt: newExpiresAt,
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    });
  });

  it("skips token update when minted token matches stored token", async () => {
    const svc = makeService();

    const saConfig = {
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      impersonateEmail: "admin@example.com",
      scopes: ["scope1"],
    };

    mockGetConnection.mockReturnValue({
      id: "gmail-sa-001",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "admin@example.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      authMethod: "service_account",
      serviceAccount: saConfig,
      tokens: {
        accessToken: "same-cached-token",
        refreshToken: "",
        expiresAt: Date.now() + 3600_000,
        tokenType: "Bearer",
        scope: "scope1",
      },
    } as IntegrationConnectionFull);

    mockMintSA.mockResolvedValue({
      accessToken: "same-cached-token", // same as stored
      expiresAt: Date.now() + 3600_000,
    });

    const result = await svc.getAccessToken("gmail-sa-001");

    expect(result).toBe("same-cached-token");
    expect(mockUpdateTokens).not.toHaveBeenCalled();
  });

  it("sets status to error when SA mint fails", async () => {
    const svc = makeService();

    const saConfig = {
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "bad-key",
      impersonateEmail: "admin@example.com",
      scopes: ["scope1"],
    };

    const conn = {
      id: "gmail-sa-002",
      providerId: "gmail",
      category: "email",
      status: "connected" as const,
      label: "admin@example.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      authMethod: "service_account" as const,
      serviceAccount: saConfig,
      tokens: {
        accessToken: "",
        refreshToken: "",
        expiresAt: 0,
        tokenType: "Bearer",
        scope: "",
      },
    };

    mockGetConnection.mockReturnValue(conn as IntegrationConnectionFull);
    mockMintSA.mockResolvedValue({ error: "Invalid private key" });

    const result = await svc.getAccessToken("gmail-sa-002");

    expect(result).toEqual({ error: "Invalid private key" });
    // Should save the connection with status: "error"
    expect(mockSaveConnection).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("returns error when connection is not found", async () => {
    const svc = makeService();

    mockGetConnection.mockReturnValue(null);

    const result = await svc.getAccessToken("nonexistent-id");

    expect(result).toEqual({ error: "Connection not found" });
  });

  it("falls through to OAuth2 path when authMethod is not service_account", async () => {
    const svc = makeService();

    mockGetConnection.mockReturnValue({
      id: "gmail-oauth-001",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "user@gmail.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      tokens: {
        accessToken: "oauth-access-token",
        refreshToken: "oauth-refresh-token",
        expiresAt: Date.now() + 3600_000,
        tokenType: "Bearer",
        scope: "scope1",
      },
    } as IntegrationConnectionFull);

    mockEnsureFresh.mockResolvedValue({
      accessToken: "oauth-access-token",
      refreshToken: "oauth-refresh-token",
      expiresAt: Date.now() + 3600_000,
      tokenType: "Bearer",
      scope: "scope1",
    });

    const result = await svc.getAccessToken("gmail-oauth-001");

    expect(result).toBe("oauth-access-token");
    expect(mockMintSA).not.toHaveBeenCalled();
    expect(mockEnsureFresh).toHaveBeenCalled();
  });
});

// ── disconnect (SA branch) ────────────────────────────────────────

describe("IntegrationService.disconnect — service account cache eviction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evicts token cache before deleting SA connection", async () => {
    const svc = makeService();

    const saConfig = {
      clientEmail: "sa@project.iam.gserviceaccount.com",
      privateKey: "fake-key",
      impersonateEmail: "admin@example.com",
      scopes: ["scope1"],
    };

    mockGetConnection.mockReturnValue({
      id: "gmail-sa-001",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "admin@example.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      authMethod: "service_account",
      serviceAccount: saConfig,
      tokens: {
        accessToken: "token",
        refreshToken: "",
        expiresAt: Date.now() + 3600_000,
        tokenType: "Bearer",
        scope: "scope1",
      },
    } as IntegrationConnectionFull);

    mockDeleteConnection.mockReturnValue(true);

    const result = await svc.disconnect("gmail-sa-001");

    expect(result).toBe(true);
    expect(mockEvictCache).toHaveBeenCalledWith(saConfig);
    expect(mockDeleteConnection).toHaveBeenCalledWith("gmail-sa-001");

    // Eviction must happen before deletion
    const evictOrder = mockEvictCache.mock.invocationCallOrder[0];
    const deleteOrder = mockDeleteConnection.mock.invocationCallOrder[0];
    expect(evictOrder).toBeLessThan(deleteOrder);
  });

  it("does not evict cache for OAuth2 connections", async () => {
    const svc = makeService();

    mockGetConnection.mockReturnValue({
      id: "gmail-oauth-001",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "user@gmail.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      tokens: {
        accessToken: "oauth-token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600_000,
        tokenType: "Bearer",
        scope: "scope1",
      },
    } as IntegrationConnectionFull);

    mockDeleteConnection.mockReturnValue(true);

    await svc.disconnect("gmail-oauth-001");

    expect(mockEvictCache).not.toHaveBeenCalled();
    expect(mockDeleteConnection).toHaveBeenCalledWith("gmail-oauth-001");
  });

  it("does not evict when connection has no serviceAccount config", async () => {
    const svc = makeService();

    // authMethod is service_account but serviceAccount config is missing
    mockGetConnection.mockReturnValue({
      id: "gmail-sa-broken",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "admin@example.com",
      connectedAt: "2025-01-01T00:00:00.000Z",
      authMethod: "service_account",
      // serviceAccount intentionally omitted
      tokens: {
        accessToken: "token",
        refreshToken: "",
        expiresAt: Date.now() + 3600_000,
        tokenType: "Bearer",
        scope: "",
      },
    } as IntegrationConnectionFull);

    mockDeleteConnection.mockReturnValue(true);

    await svc.disconnect("gmail-sa-broken");

    expect(mockEvictCache).not.toHaveBeenCalled();
  });

  it("still deletes even when connection is not found (no eviction)", async () => {
    const svc = makeService();

    mockGetConnection.mockReturnValue(null);
    mockDeleteConnection.mockReturnValue(false);

    const result = await svc.disconnect("nonexistent-id");

    expect(result).toBe(false);
    expect(mockEvictCache).not.toHaveBeenCalled();
    expect(mockDeleteConnection).toHaveBeenCalledWith("nonexistent-id");
  });
});
