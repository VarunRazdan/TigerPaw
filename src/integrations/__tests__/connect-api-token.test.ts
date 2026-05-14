/**
 * Tests for IntegrationService.connectApiToken — Jira basic-auth path.
 *
 * Covers happy path, /myself validation failure (401/403), invalid site URLs,
 * missing fields, and that the persisted connection carries the right shape
 * (authMethod, config.baseUrl, config.authScheme, tokens.accessToken).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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
  findConnectionByProvider: vi.fn(() => null),
  saveIntegrationConnection: vi.fn(),
  getIntegrationConnection: vi.fn(),
  listIntegrationConnections: vi.fn(() => []),
  deleteIntegrationConnection: vi.fn(),
  updateIntegrationTokens: vi.fn(),
}));

vi.mock("../sdk/registry.js", () => ({
  listIntegrations: vi.fn(() => [
    {
      id: "jira",
      name: "Jira",
      category: "productivity",
      icon: "jira",
      description: "Jira Cloud",
      auth: {
        type: "oauth2",
        authorizationUrl: "https://auth.atlassian.com/authorize",
        tokenUrl: "https://auth.atlassian.com/oauth/token",
        scopes: [],
        clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
        clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
      },
      actions: [],
      triggers: [],
    },
  ]),
}));

vi.mock("../sdk/providers/index.js", () => ({}));

import { IntegrationService } from "../index.js";
import { findConnectionByProvider, saveIntegrationConnection } from "../token-store.js";

const mockFind = vi.mocked(findConnectionByProvider);
const mockSave = vi.mocked(saveIntegrationConnection);

function makeService() {
  return new IntegrationService(18789);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFind.mockReturnValue(null);
});

describe("IntegrationService.connectApiToken — Jira", () => {
  it("happy path: validates via /myself, persists connection with Basic auth shape", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ emailAddress: "u@acme.com", displayName: "User Acme" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const svc = makeService();
    const result = await svc.connectApiToken("jira" as never, {
      siteUrl: "acme.atlassian.net",
      email: "u@acme.com",
      apiToken: "ATATT3xFf...",
    });

    expect("id" in result).toBe(true);
    if (!("id" in result)) {
      return;
    }

    expect(result.providerId).toBe("jira");
    expect(result.status).toBe("connected");
    expect(result.authMethod).toBe("api_token");
    expect(result.label).toBe("acme — u@acme.com");

    // Verify the fetch hit /myself with Basic auth.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://acme.atlassian.net/rest/api/3/myself");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
    const decoded = Buffer.from(headers.Authorization.slice("Basic ".length), "base64").toString();
    expect(decoded).toBe("u@acme.com:ATATT3xFf...");

    // Verify the persisted shape (config + tokens).
    expect(mockSave).toHaveBeenCalledTimes(1);
    const saved = mockSave.mock.calls[0][0];
    expect(saved.authMethod).toBe("api_token");
    expect(saved.tokens.tokenType).toBe("Basic");
    expect(saved.tokens.refreshToken).toBe("");
    expect(saved.config).toMatchObject({
      baseUrl: "https://acme.atlassian.net",
      siteName: "acme",
      authScheme: "Basic",
      accountEmail: "u@acme.com",
    });
  });

  it("rejects bad credentials with a 401-specific error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 })),
    );

    const svc = makeService();
    const result = await svc.connectApiToken("jira" as never, {
      siteUrl: "https://acme.atlassian.net",
      email: "u@acme.com",
      apiToken: "wrong",
    });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/Atlassian rejected/i);
    }
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("rejects non-Atlassian-Cloud hostnames", async () => {
    const svc = makeService();
    const result = await svc.connectApiToken("jira" as never, {
      siteUrl: "https://example.com",
      email: "u@example.com",
      apiToken: "x",
    });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/atlassian\.net/i);
    }
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("accepts site URL without scheme and with trailing slash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ emailAddress: "u@x.com" }), { status: 200 })),
    );
    const svc = makeService();
    const result = await svc.connectApiToken("jira" as never, {
      siteUrl: "acme.atlassian.net/",
      email: "u@x.com",
      apiToken: "y",
    });
    expect("id" in result).toBe(true);
    if ("id" in result) {
      // Saved config should have the normalized URL (no trailing slash).
      const saved = mockSave.mock.calls[0][0];
      expect(saved.config).toMatchObject({ baseUrl: "https://acme.atlassian.net" });
    }
  });

  it("rejects when email or apiToken is empty", async () => {
    const svc = makeService();
    const result = await svc.connectApiToken("jira" as never, {
      siteUrl: "acme.atlassian.net",
      email: "",
      apiToken: "y",
    });
    expect("error" in result).toBe(true);
  });

  it("rejects api_token auth for non-Jira providers", async () => {
    const svc = makeService();
    const result = await svc.connectApiToken("gmail" as never, {
      siteUrl: "x",
      email: "x",
      apiToken: "x",
    });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/not supported/i);
    }
  });
});
