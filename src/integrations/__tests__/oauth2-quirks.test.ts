/**
 * Tests for per-provider OAuth quirks: PKCE opt-out, extraAuthParams,
 * useGoogleOfflineAccess gating, and Jira cloudId post-exchange discovery.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProviderShape = {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  extraAuthParams?: Record<string, string>;
  usePkce?: boolean;
  useGoogleOfflineAccess?: boolean;
};

let providerShape: ProviderShape = {
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: ["openid"],
  clientIdEnvVar: "GOOGLE_CLIENT_ID",
  clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
};

function setupMocks() {
  vi.doMock("../../config/io.js", () => ({ loadConfig: () => ({}) }));
  vi.doMock("../sdk/registry.js", () => ({ getIntegration: () => undefined }));
  vi.doMock("../types.js", async () => {
    const actual = (await vi.importActual("../types.js")) as Record<string, unknown>;
    return {
      ...actual,
      getProviderDefinition: (id: string) => ({
        id,
        name: "TestProvider",
        category: "email",
        icon: "",
        description: "",
        authType: "oauth2",
        capabilities: [],
        oauth2Config: { ...providerShape },
      }),
    };
  });
}

beforeEach(() => {
  vi.resetModules();
  setupMocks();
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.ATLASSIAN_CLIENT_ID = "atlassian-id";
  process.env.ATLASSIAN_CLIENT_SECRET = "atlassian-secret";
});

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.ATLASSIAN_CLIENT_ID;
  delete process.env.ATLASSIAN_CLIENT_SECRET;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("startOAuthFlow honors usePkce: false", () => {
  it("omits code_challenge and code_challenge_method when usePkce=false", async () => {
    providerShape = {
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: ["read:jira-work"],
      clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
      clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
      usePkce: false,
      useGoogleOfflineAccess: false,
    };
    const { startOAuthFlow } = await import("../oauth2.js");
    const result = startOAuthFlow("jira" as never, 18789);
    expect("error" in result).toBe(false);
    if ("error" in result) {
      return;
    }
    const url = new URL(result.authUrl);
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("omits code_verifier from token exchange when no PKCE was used", async () => {
    providerShape = {
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: ["read:jira-work"],
      clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
      clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
      usePkce: false,
      useGoogleOfflineAccess: false,
    };
    const { startOAuthFlow, exchangeOAuthCode } = await import("../oauth2.js");
    const start = startOAuthFlow("jira" as never, 18789);
    if ("error" in start) {
      throw new Error("start failed");
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const urlStr =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (urlStr.includes("accessible-resources")) {
        return new Response(
          JSON.stringify([{ id: "cloud-abc", name: "Acme", url: "https://acme.atlassian.net" }]),
          { status: 200 },
        );
      }
      if (urlStr.includes("/myself")) {
        return new Response(JSON.stringify({ emailAddress: "u@acme.com" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "read:jira-work",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await exchangeOAuthCode(start.state, "code-x");
    // The first fetch call is the token exchange.
    const firstCall = fetchMock.mock.calls[0];
    const body = firstCall[1]?.body;
    expect(typeof body).toBe("string");
    const params = new URLSearchParams(typeof body === "string" ? body : "");
    expect(params.get("code_verifier")).toBeNull();
  });
});

describe("startOAuthFlow merges extraAuthParams", () => {
  it("appends audience=api.atlassian.com from extraAuthParams", async () => {
    providerShape = {
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: ["read:jira-work"],
      clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
      clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
      usePkce: false,
      useGoogleOfflineAccess: false,
      extraAuthParams: { audience: "api.atlassian.com" },
    };
    const { startOAuthFlow } = await import("../oauth2.js");
    const result = startOAuthFlow("jira" as never, 18789);
    if ("error" in result) {
      throw new Error("start failed");
    }
    const url = new URL(result.authUrl);
    expect(url.searchParams.get("audience")).toBe("api.atlassian.com");
  });
});

describe("startOAuthFlow honors useGoogleOfflineAccess: false", () => {
  it("omits access_type=offline when useGoogleOfflineAccess=false", async () => {
    providerShape = {
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: ["read:jira-work"],
      clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
      clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
      usePkce: false,
      useGoogleOfflineAccess: false,
    };
    const { startOAuthFlow } = await import("../oauth2.js");
    const result = startOAuthFlow("jira" as never, 18789);
    if ("error" in result) {
      throw new Error("start failed");
    }
    const url = new URL(result.authUrl);
    expect(url.searchParams.get("access_type")).toBeNull();
  });

  it("includes access_type=offline by default (Google providers preserved)", async () => {
    providerShape = {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["openid"],
      clientIdEnvVar: "GOOGLE_CLIENT_ID",
      clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
    };
    const { startOAuthFlow } = await import("../oauth2.js");
    const result = startOAuthFlow("gmail" as never, 18789);
    if ("error" in result) {
      throw new Error("start failed");
    }
    const url = new URL(result.authUrl);
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
});

describe("exchangeOAuthCode Jira cloudId discovery", () => {
  it("sets connection.config.cloudId from accessible-resources and labels with site name", async () => {
    providerShape = {
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: ["read:jira-work"],
      clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
      clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
      usePkce: false,
      useGoogleOfflineAccess: false,
    };
    const { startOAuthFlow, exchangeOAuthCode } = await import("../oauth2.js");
    const start = startOAuthFlow("jira" as never, 18789);
    if ("error" in start) {
      throw new Error("start failed");
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const urlStr =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (urlStr.endsWith("/oauth/token/accessible-resources")) {
          return new Response(
            JSON.stringify([
              { id: "cloud-xyz", name: "Acme Inc", url: "https://acme.atlassian.net" },
            ]),
            { status: 200 },
          );
        }
        if (urlStr.endsWith("/rest/api/3/myself")) {
          return new Response(JSON.stringify({ emailAddress: "u@acme.com" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            access_token: "at",
            refresh_token: "rt",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "read:jira-work",
          }),
          { status: 200 },
        );
      }),
    );

    const conn = await exchangeOAuthCode(start.state, "code-x");
    expect("error" in conn).toBe(false);
    if ("error" in conn) {
      return;
    }
    expect(conn.config).toEqual({
      cloudId: "cloud-xyz",
      siteName: "Acme Inc",
      siteUrl: "https://acme.atlassian.net",
      baseUrl: "https://api.atlassian.com/ex/jira/cloud-xyz",
      authScheme: "Bearer",
    });
    expect(conn.label).toBe("Acme Inc — u@acme.com");
    expect(conn.accountEmail).toBe("u@acme.com");
  });

  it("returns jira_no_accessible_resources when the array is empty", async () => {
    providerShape = {
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: ["read:jira-work"],
      clientIdEnvVar: "ATLASSIAN_CLIENT_ID",
      clientSecretEnvVar: "ATLASSIAN_CLIENT_SECRET",
      usePkce: false,
      useGoogleOfflineAccess: false,
    };
    const { startOAuthFlow, exchangeOAuthCode } = await import("../oauth2.js");
    const start = startOAuthFlow("jira" as never, 18789);
    if ("error" in start) {
      throw new Error("start failed");
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const urlStr =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (urlStr.endsWith("/oauth/token/accessible-resources")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            access_token: "at",
            refresh_token: "rt",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "read:jira-work",
          }),
          { status: 200 },
        );
      }),
    );

    const result = await exchangeOAuthCode(start.state, "code-x");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/^jira_no_accessible_resources/);
    }
  });
});
