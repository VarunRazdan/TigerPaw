/**
 * Tests for token-store.ts — service account field round-trip.
 *
 * Verifies that SA-specific fields (authMethod, serviceAccount config)
 * survive the serialize/deserialize cycle through the credential vault.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DAL layer and credential vault so we can intercept storage
// without touching real SQLite or the filesystem.
const credentialStore = new Map<string, Record<string, unknown>>();

vi.mock("../../dal/credentials.js", () => ({
  dalFindByType: vi.fn((type: string) => {
    const results: Record<string, unknown>[] = [];
    for (const entry of credentialStore.values()) {
      if (entry.type === type) {
        results.push(entry);
      }
    }
    return results;
  }),
}));

vi.mock("../../workflows/credentials.js", () => ({
  getCredential: vi.fn((id: string) => {
    const entry = credentialStore.get(id);
    if (!entry) {
      return null;
    }
    return entry;
  }),
  saveCredential: vi.fn((credential: Record<string, unknown>) => {
    // Store raw (skip encryption since we're testing the token-store layer,
    // not the encryption layer)
    credentialStore.set(credential.id as string, credential);
  }),
  deleteCredential: vi.fn((id: string) => {
    return credentialStore.delete(id);
  }),
  resolveCredential: vi.fn(),
}));

import {
  saveIntegrationConnection,
  getIntegrationConnection,
  findConnectionByProvider,
  listIntegrationConnections,
  deleteIntegrationConnection,
  updateIntegrationTokens,
} from "../token-store.js";
import type { IntegrationConnectionFull } from "../types.js";

// ── Fixtures ──────────────────────────────────────────────────────

function makeSAConnection(
  overrides?: Partial<IntegrationConnectionFull>,
): IntegrationConnectionFull {
  return {
    id: "gmail-sa-roundtrip",
    providerId: "gmail",
    category: "email",
    status: "connected",
    label: "admin@example.com",
    accountEmail: "admin@example.com",
    authMethod: "service_account",
    connectedAt: "2025-06-01T00:00:00.000Z",
    lastUsedAt: "2025-06-01T12:00:00.000Z",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    tokens: {
      accessToken: "sa-access-token-xyz",
      refreshToken: "",
      expiresAt: 1750000000000,
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    },
    serviceAccount: {
      clientEmail: "sa@my-project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nMIIE...fake...key\n-----END PRIVATE KEY-----",
      impersonateEmail: "admin@example.com",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    },
    ...overrides,
  };
}

function makeOAuth2Connection(): IntegrationConnectionFull {
  return {
    id: "gmail-oauth-001",
    providerId: "gmail",
    category: "email",
    status: "connected",
    label: "user@gmail.com",
    accountEmail: "user@gmail.com",
    connectedAt: "2025-06-01T00:00:00.000Z",
    tokens: {
      accessToken: "oauth-access-token",
      refreshToken: "oauth-refresh-token",
      expiresAt: 1750000000000,
      tokenType: "Bearer",
      scope: "scope1 scope2",
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("token-store — service account field round-trip", () => {
  beforeEach(() => {
    credentialStore.clear();
    vi.clearAllMocks();
  });

  it("preserves all SA fields through save/read cycle", () => {
    const original = makeSAConnection();

    saveIntegrationConnection(original);
    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");

    expect(retrieved).not.toBeNull();
    expect(retrieved!.authMethod).toBe("service_account");
    expect(retrieved!.serviceAccount).toBeDefined();
    expect(retrieved!.serviceAccount!.clientEmail).toBe("sa@my-project.iam.gserviceaccount.com");
    expect(retrieved!.serviceAccount!.privateKey).toBe(
      "-----BEGIN PRIVATE KEY-----\nMIIE...fake...key\n-----END PRIVATE KEY-----",
    );
    expect(retrieved!.serviceAccount!.impersonateEmail).toBe("admin@example.com");
    expect(retrieved!.serviceAccount!.scopes).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ]);
  });

  it("preserves token fields for SA connections", () => {
    const original = makeSAConnection();

    saveIntegrationConnection(original);
    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");

    expect(retrieved!.tokens.accessToken).toBe("sa-access-token-xyz");
    expect(retrieved!.tokens.refreshToken).toBe("");
    expect(retrieved!.tokens.expiresAt).toBe(1750000000000);
    expect(retrieved!.tokens.tokenType).toBe("Bearer");
    expect(retrieved!.tokens.scope).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });

  it("preserves connection metadata for SA connections", () => {
    const original = makeSAConnection();

    saveIntegrationConnection(original);
    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");

    expect(retrieved!.providerId).toBe("gmail");
    expect(retrieved!.category).toBe("email");
    expect(retrieved!.status).toBe("connected");
    expect(retrieved!.label).toBe("admin@example.com");
    expect(retrieved!.accountEmail).toBe("admin@example.com");
  });

  it("does not produce serviceAccount for OAuth2 connections", () => {
    const oauth = makeOAuth2Connection();

    saveIntegrationConnection(oauth);
    const retrieved = getIntegrationConnection("gmail-oauth-001");

    expect(retrieved).not.toBeNull();
    expect(retrieved!.authMethod).toBe("oauth2");
    expect(retrieved!.serviceAccount).toBeUndefined();
  });

  it("does not set authMethod field for OAuth2 connections (defaults to oauth2)", () => {
    const oauth = makeOAuth2Connection();

    saveIntegrationConnection(oauth);
    const retrieved = getIntegrationConnection("gmail-oauth-001");

    // authMethod defaults to "oauth2" on read when not stored explicitly
    expect(retrieved!.authMethod).toBe("oauth2");
  });

  it("handles SA config with empty impersonateEmail", () => {
    const conn = makeSAConnection({
      serviceAccount: {
        clientEmail: "sa@project.iam.gserviceaccount.com",
        privateKey: "key",
        impersonateEmail: "",
        scopes: ["scope1"],
      },
    });

    saveIntegrationConnection(conn);
    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");

    expect(retrieved!.serviceAccount!.impersonateEmail).toBe("");
  });

  it("handles SA config with multiple scopes joined and split correctly", () => {
    const conn = makeSAConnection({
      serviceAccount: {
        clientEmail: "sa@project.iam.gserviceaccount.com",
        privateKey: "key",
        impersonateEmail: "admin@example.com",
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.compose",
        ],
      },
    });

    saveIntegrationConnection(conn);
    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");

    expect(retrieved!.serviceAccount!.scopes).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
    ]);
  });

  it("handles SA config with empty scopes array", () => {
    const conn = makeSAConnection({
      serviceAccount: {
        clientEmail: "sa@project.iam.gserviceaccount.com",
        privateKey: "key",
        impersonateEmail: "admin@example.com",
        scopes: [],
      },
    });

    saveIntegrationConnection(conn);
    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");

    expect(retrieved!.serviceAccount!.scopes).toEqual([]);
  });

  it("findConnectionByProvider returns SA connections correctly", () => {
    const conn = makeSAConnection();
    saveIntegrationConnection(conn);

    const found = findConnectionByProvider("gmail");

    expect(found).not.toBeNull();
    expect(found!.authMethod).toBe("service_account");
    expect(found!.serviceAccount).toBeDefined();
    expect(found!.serviceAccount!.clientEmail).toBe("sa@my-project.iam.gserviceaccount.com");
  });

  it("updateIntegrationTokens preserves SA config on token refresh", () => {
    const conn = makeSAConnection();
    saveIntegrationConnection(conn);

    updateIntegrationTokens("gmail-sa-roundtrip", {
      accessToken: "refreshed-sa-token",
      refreshToken: "",
      expiresAt: 1760000000000,
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    });

    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");

    // Tokens should be updated
    expect(retrieved!.tokens.accessToken).toBe("refreshed-sa-token");
    expect(retrieved!.tokens.expiresAt).toBe(1760000000000);

    // SA config should be preserved
    expect(retrieved!.serviceAccount).toBeDefined();
    expect(retrieved!.serviceAccount!.clientEmail).toBe("sa@my-project.iam.gserviceaccount.com");
    expect(retrieved!.authMethod).toBe("service_account");
  });

  it("deleteIntegrationConnection removes SA connections", () => {
    const conn = makeSAConnection();
    saveIntegrationConnection(conn);

    const deleted = deleteIntegrationConnection("gmail-sa-roundtrip");
    expect(deleted).toBe(true);

    const retrieved = getIntegrationConnection("gmail-sa-roundtrip");
    expect(retrieved).toBeNull();
  });

  it("listIntegrationConnections includes authMethod for SA connections", () => {
    const conn = makeSAConnection();
    saveIntegrationConnection(conn);

    const list = listIntegrationConnections();

    expect(list.length).toBe(1);
    expect(list[0].authMethod).toBe("service_account");
    expect(list[0].providerId).toBe("gmail");
    // Listing should NOT include tokens or serviceAccount
    expect(list[0]).not.toHaveProperty("tokens");
    expect(list[0]).not.toHaveProperty("serviceAccount");
  });
});
