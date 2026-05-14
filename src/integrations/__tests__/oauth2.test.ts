/**
 * Tests for `src/integrations/oauth2.ts` — PKCE generation, pendingFlows
 * size cap, TTL, code_verifier injection on token exchange, and Zoom
 * compat error mapping.
 */

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock the dependencies before each test so module-level state is isolated.
function setupMocks(): void {
  vi.doMock("../../config/io.js", () => ({
    loadConfig: () => ({
      integrations: {
        oauth: {
          google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
        },
      },
    }),
  }));
  vi.doMock("../sdk/registry.js", () => ({ getIntegration: () => undefined }));
  vi.doMock("../types.js", async () => {
    const actual = (await vi.importActual("../types.js")) as Record<string, unknown>;
    return {
      ...actual,
      getProviderDefinition: (id: string) => ({
        id,
        name: id === "zoom" ? "Zoom" : "Gmail",
        category: "email",
        icon: "",
        description: "",
        authType: "oauth2",
        capabilities: [],
        oauth2Config: {
          authorizationUrl:
            id === "zoom"
              ? "https://zoom.us/oauth/authorize"
              : "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl:
            id === "zoom" ? "https://zoom.us/oauth/token" : "https://oauth2.googleapis.com/token",
          scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
          clientIdEnvVar: id === "zoom" ? "ZOOM_CLIENT_ID" : "GOOGLE_CLIENT_ID",
          clientSecretEnvVar: id === "zoom" ? "ZOOM_CLIENT_SECRET" : "GOOGLE_CLIENT_SECRET",
        },
      }),
    };
  });
}

beforeEach(() => {
  vi.resetModules();
  setupMocks();
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.ZOOM_CLIENT_ID = "zoom-test-id";
  process.env.ZOOM_CLIENT_SECRET = "zoom-test-secret";
});

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.ZOOM_CLIENT_ID;
  delete process.env.ZOOM_CLIENT_SECRET;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("startOAuthFlow PKCE", () => {
  it("appends code_challenge=<base64url(sha256(verifier))> and method=S256 to the auth URL", async () => {
    const { startOAuthFlow } = await import("../oauth2.js");
    const result = startOAuthFlow("gmail", 18789);
    expect("error" in result).toBe(false);
    if ("error" in result) {
      return;
    }
    const url = new URL(result.authUrl);
    const challenge = url.searchParams.get("code_challenge");
    const method = url.searchParams.get("code_challenge_method");
    expect(method).toBe("S256");
    expect(challenge).toBeTruthy();
    // Base64url challenge is 43 chars (256 bits / 6 bits-per-char rounded up; no padding).
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("startOAuthFlow size cap", () => {
  it("rejects the 33rd in-flight flow with too_many_pending_flows", async () => {
    const { startOAuthFlow } = await import("../oauth2.js");
    for (let i = 0; i < 32; i++) {
      const r = startOAuthFlow("gmail", 18789);
      expect("error" in r).toBe(false);
    }
    const overflow = startOAuthFlow("gmail", 18789);
    expect(overflow).toEqual({ error: "too_many_pending_flows" });
  });

  it("size cap clears stale flows first, then admits the new one", async () => {
    vi.useFakeTimers();
    const { startOAuthFlow } = await import("../oauth2.js");
    for (let i = 0; i < 32; i++) {
      startOAuthFlow("gmail", 18789);
    }
    // Advance past the 3-minute TTL so the next call's cleanup empties the map.
    vi.setSystemTime(Date.now() + 4 * 60 * 1000);
    const after = startOAuthFlow("gmail", 18789);
    expect("error" in after).toBe(false);
  });
});

describe("startOAuthFlow TTL", () => {
  it("rejects exchange of a flow created 4 minutes ago (3-min TTL)", async () => {
    vi.useFakeTimers();
    const { startOAuthFlow, exchangeOAuthCode } = await import("../oauth2.js");
    const start = startOAuthFlow("gmail", 18789);
    if ("error" in start) {
      throw new Error("start failed");
    }
    vi.setSystemTime(Date.now() + 4 * 60 * 1000);
    const result = await exchangeOAuthCode(start.state, "code-x");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/Invalid or expired/i);
    }
  });
});

describe("exchangeOAuthCode PKCE", () => {
  it("includes code_verifier in the token-exchange POST body", async () => {
    const { startOAuthFlow, exchangeOAuthCode } = await import("../oauth2.js");
    const start = startOAuthFlow("gmail", 18789);
    if ("error" in start) {
      throw new Error("start failed");
    }

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            access_token: "at",
            refresh_token: "rt",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "openid",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await exchangeOAuthCode(start.state, "auth-code-1");
    // First call is the token exchange.
    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0];
    const requestInit = firstCall[1];
    expect(requestInit).toBeDefined();
    const rawBody = requestInit?.body;
    expect(typeof rawBody).toBe("string");
    const params = new URLSearchParams(typeof rawBody === "string" ? rawBody : "");
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-1");
    expect(params.get("code_verifier")).toBeTruthy();
    // Verifier looks like base64url, 43-44 chars for 32 random bytes.
    expect(params.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("maps Zoom invalid_grant to a Zoom-specific compat error string", async () => {
    const { startOAuthFlow, exchangeOAuthCode } = await import("../oauth2.js");
    const start = startOAuthFlow("zoom", 18789);
    if ("error" in start) {
      throw new Error("start failed");
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response('{"reason":"invalid_grant"}', { status: 400 }),
      ),
    );

    const result = await exchangeOAuthCode(start.state, "auth-code-2");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("zoom_pkce_compat");
    }
  });
});

describe("PKCE pair entropy", () => {
  it("32 starts produce 32 distinct verifiers (sanity check on randomBytes)", async () => {
    const { startOAuthFlow } = await import("../oauth2.js");
    const challenges = new Set<string>();
    for (let i = 0; i < 32; i++) {
      const r = startOAuthFlow("gmail", 18789);
      if ("error" in r) {
        throw new Error("start failed");
      }
      const url = new URL(r.authUrl);
      challenges.add(url.searchParams.get("code_challenge") ?? "");
    }
    expect(challenges.size).toBe(32);
  });

  it("a valid SHA-256(verifier) fixed pair encoded as base64url passes through unchanged", () => {
    // Sanity-check that base64url encoding is consistent with the spec.
    const verifier = "abc123_-DEF";
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain("=");
  });
});
