/**
 * Tests for Google Service Account token minter.
 */

import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseServiceAccountJson,
  mintServiceAccountToken,
  evictTokenCache,
  clearTokenCache,
} from "../service-account.js";
import type { ServiceAccountConfig } from "../types.js";

// ── Fixtures ──────────────────────────────────────────────────────

// Generate a real RSA key pair for signing tests
const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const VALID_SA_JSON = JSON.stringify({
  type: "service_account",
  client_email: "test@project.iam.gserviceaccount.com",
  private_key: rsaPrivateKey,
  token_uri: "https://oauth2.googleapis.com/token",
  project_id: "test-project",
});

function makeSaConfig(overrides?: Partial<ServiceAccountConfig>): ServiceAccountConfig {
  return {
    clientEmail: "test@project.iam.gserviceaccount.com",
    privateKey: rsaPrivateKey,
    impersonateEmail: "admin@example.com",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    ...overrides,
  };
}

// ── parseServiceAccountJson ─────────────────────────────────────

describe("parseServiceAccountJson", () => {
  it("parses valid service account JSON", () => {
    const result = parseServiceAccountJson(VALID_SA_JSON);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clientEmail).toBe("test@project.iam.gserviceaccount.com");
      expect(result.privateKey).toContain("BEGIN PRIVATE KEY");
      expect(result.tokenUri).toBe("https://oauth2.googleapis.com/token");
    }
  });

  it("rejects invalid JSON", () => {
    const result = parseServiceAccountJson("not json{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid JSON");
    }
  });

  it("rejects wrong type", () => {
    const result = parseServiceAccountJson(JSON.stringify({ type: "authorized_user" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("authorized_user");
    }
  });

  it("rejects missing client_email", () => {
    const result = parseServiceAccountJson(
      JSON.stringify({ type: "service_account", private_key: "key" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Missing client_email");
    }
  });

  it("rejects missing private_key", () => {
    const result = parseServiceAccountJson(
      JSON.stringify({ type: "service_account", client_email: "x@y.com" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Missing private_key");
    }
  });

  it("defaults tokenUri when missing", () => {
    const json = JSON.stringify({
      type: "service_account",
      client_email: "x@y.com",
      private_key: rsaPrivateKey,
    });
    const result = parseServiceAccountJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokenUri).toBe("https://oauth2.googleapis.com/token");
    }
  });

  it("normalizes \\n in private key", () => {
    const key = rsaPrivateKey.replace(/\n/g, "\\n");
    const json = JSON.stringify({
      type: "service_account",
      client_email: "x@y.com",
      private_key: key,
    });
    const result = parseServiceAccountJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.privateKey).toContain("\n");
    }
  });
});

// ── mintServiceAccountToken ─────────────────────────────────────

describe("mintServiceAccountToken", () => {
  beforeEach(() => {
    clearTokenCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a valid JWT and exchanges it for an access token", async () => {
    const sa = makeSaConfig();

    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "minted-token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200 },
      ),
    );

    const result = await mintServiceAccountToken(sa);
    expect("accessToken" in result).toBe(true);
    if ("accessToken" in result) {
      expect(result.accessToken).toBe("minted-token-123");
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    }

    // Verify the request
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(opts?.method).toBe("POST");

    // Decode and verify the JWT assertion
    const body = new URLSearchParams(opts?.body as string);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const assertion = body.get("assertion")!;
    const [headerB64, payloadB64] = assertion.split(".");

    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
    expect(header.alg).toBe("RS256");
    expect(header.typ).toBe("JWT");

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    expect(payload.iss).toBe(sa.clientEmail);
    expect(payload.sub).toBe(sa.impersonateEmail);
    expect(payload.scope).toBe(sa.scopes.join(" "));
    expect(payload.aud).toBe("https://oauth2.googleapis.com/token");
    expect(payload.exp - payload.iat).toBe(3600);

    // Verify the signature is valid with the public key
    const signingInput = `${headerB64}.${payloadB64}`;
    const signatureB64 = assertion.split(".")[2];
    const signatureBuffer = Buffer.from(signatureB64, "base64url");
    const isValid = crypto.verify(
      "RSA-SHA256",
      Buffer.from(signingInput, "utf8"),
      rsaPublicKey,
      signatureBuffer,
    );
    expect(isValid).toBe(true);
  });

  it("returns cached token on second call", async () => {
    const sa = makeSaConfig();

    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "cached-token", expires_in: 3600 }), {
          status: 200,
        }),
      );

    const result1 = await mintServiceAccountToken(sa);
    const result2 = await mintServiceAccountToken(sa);

    expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch
    expect(result1).toEqual(result2);
  });

  it("re-fetches when cached token is near expiry", async () => {
    const sa = makeSaConfig();

    // First call returns a token that's already near expiry
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "short-lived", expires_in: 60 }), // 1 min
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600 }), {
          status: 200,
        }),
      );

    await mintServiceAccountToken(sa);
    const result2 = await mintServiceAccountToken(sa);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    if ("accessToken" in result2) {
      expect(result2.accessToken).toBe("refreshed");
    }
  });

  it("returns error for invalid private key", async () => {
    const sa = makeSaConfig({ privateKey: "not-a-real-key" });
    const result = await mintServiceAccountToken(sa);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Invalid private key");
    }
  });

  it("returns error when token endpoint fails", async () => {
    const sa = makeSaConfig();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response('{"error": "invalid_grant"}', { status: 400 }),
    );

    const result = await mintServiceAccountToken(sa);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Token exchange failed (400)");
    }
  });

  it("returns error when fetch throws", async () => {
    const sa = makeSaConfig();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await mintServiceAccountToken(sa);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Token endpoint unreachable");
    }
  });
});

// ── evictTokenCache ─────────────────────────────────────────────

describe("evictTokenCache", () => {
  beforeEach(() => {
    clearTokenCache();
    vi.restoreAllMocks();
  });

  it("evicts only the matching config, leaves others cached", async () => {
    const sa1 = makeSaConfig({ impersonateEmail: "user1@example.com" });
    const sa2 = makeSaConfig({ impersonateEmail: "user2@example.com" });

    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-1", expires_in: 3600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-2", expires_in: 3600 }), {
          status: 200,
        }),
      );

    // Mint both
    await mintServiceAccountToken(sa1);
    await mintServiceAccountToken(sa2);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Evict sa1 only
    evictTokenCache(sa1);

    // sa2 should still be cached (no additional fetch)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "token-1-refreshed", expires_in: 3600 }), {
        status: 200,
      }),
    );

    const result1 = await mintServiceAccountToken(sa1);
    const result2 = await mintServiceAccountToken(sa2);

    // sa1 required a new fetch, sa2 did not
    expect(mockFetch).toHaveBeenCalledTimes(3);
    if ("accessToken" in result1) {
      expect(result1.accessToken).toBe("token-1-refreshed");
    }
    if ("accessToken" in result2) {
      expect(result2.accessToken).toBe("token-2");
    }
  });
});
