/**
 * Round-trip test for `connection.config` through the token-store
 * serialize/deserialize layer (used by Jira to persist its cloudId).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getCredential: vi.fn((id: string) => credentialStore.get(id) ?? null),
  saveCredential: vi.fn((credential: Record<string, unknown>) => {
    credentialStore.set(credential.id as string, credential);
  }),
  deleteCredential: vi.fn((id: string) => credentialStore.delete(id)),
  resolveCredential: vi.fn(),
}));

import { saveIntegrationConnection, getIntegrationConnection } from "../token-store.js";
import type { IntegrationConnectionFull } from "../types.js";

function makeOAuthConn(overrides?: Partial<IntegrationConnectionFull>): IntegrationConnectionFull {
  return {
    id: "jira-abc123",
    providerId: "jira" as never,
    category: "productivity",
    status: "connected",
    label: "Acme — u@acme.com",
    accountEmail: "u@acme.com",
    connectedAt: "2026-01-01T00:00:00Z",
    tokens: {
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: 9999999999999,
      tokenType: "Bearer",
      scope: "read:jira-work",
    },
    ...overrides,
  };
}

beforeEach(() => {
  credentialStore.clear();
});

describe("token-store: connection.config round-trip", () => {
  it("persists and reloads cloudId/siteName/siteUrl via JSON field", () => {
    const conn = makeOAuthConn({
      config: {
        cloudId: "cloud-abc",
        siteName: "Acme Inc",
        siteUrl: "https://acme.atlassian.net",
      },
    });
    saveIntegrationConnection(conn);
    const loaded = getIntegrationConnection(conn.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.config).toEqual({
      cloudId: "cloud-abc",
      siteName: "Acme Inc",
      siteUrl: "https://acme.atlassian.net",
    });
  });

  it("returns no config when none was stored", () => {
    const conn = makeOAuthConn();
    saveIntegrationConnection(conn);
    const loaded = getIntegrationConnection(conn.id);
    expect(loaded?.config).toBeUndefined();
  });

  it("falls back to undefined when stored config field is malformed", () => {
    const conn = makeOAuthConn({ config: { cloudId: "cloud-abc" } });
    saveIntegrationConnection(conn);
    // Corrupt the stored value directly.
    const raw = credentialStore.get(conn.id) as Record<string, unknown>;
    const fields = raw.fields as Record<string, string>;
    fields.config = "not-json-{";
    const loaded = getIntegrationConnection(conn.id);
    expect(loaded?.config).toBeUndefined();
  });
});
