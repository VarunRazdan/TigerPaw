/**
 * Google Service Account token minter.
 *
 * Signs a JWT with RS256 and exchanges it for a short-lived access token
 * via Google's OAuth2 token endpoint. Tokens are cached until 5 min
 * before expiry (same threshold as ensureFreshTokens in oauth2.ts).
 */

import { createHash, createPrivateKey, sign as cryptoSign } from "node:crypto";
import type { ServiceAccountConfig } from "./types.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_LIFETIME_SEC = 3600; // 1 hour
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes

// ── JWT helpers ──────────────────────────────────────────────────

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64UrlJson(value: object): string {
  return toBase64Url(Buffer.from(JSON.stringify(value)));
}

// ── Token cache ─────────────────────────────────────────────────

type CachedToken = { accessToken: string; expiresAt: number };

const tokenCache = new Map<string, CachedToken>();

function cacheKey(sa: ServiceAccountConfig): string {
  const keyHash = createHash("sha256").update(sa.privateKey).digest("hex").slice(0, 8);
  return `${sa.clientEmail}:${sa.impersonateEmail}:${sa.scopes.join(",")}:${keyHash}`;
}

// ── Public API ──────────────────────────────────────────────────

export type ServiceAccountTokenResult =
  | { accessToken: string; expiresAt: number }
  | { error: string };

/**
 * Parse and validate a Google service account JSON key file.
 */
export function parseServiceAccountJson(
  raw: string,
):
  | { ok: true; clientEmail: string; privateKey: string; tokenUri: string }
  | { ok: false; error: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  if (parsed.type !== "service_account") {
    return { ok: false, error: `Expected type "service_account", got "${String(parsed.type)}"` };
  }
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  const tokenUri = parsed.token_uri;
  if (typeof clientEmail !== "string" || !clientEmail) {
    return { ok: false, error: "Missing client_email" };
  }
  if (typeof privateKey !== "string" || !privateKey) {
    return { ok: false, error: "Missing private_key" };
  }
  return {
    ok: true,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    tokenUri: typeof tokenUri === "string" && tokenUri ? tokenUri : GOOGLE_TOKEN_URL,
  };
}

/**
 * Mint an access token for a Google service account.
 *
 * Uses RS256 JWT assertion exchanged at Google's token endpoint.
 * Results are cached until 5 min before expiry.
 */
export async function mintServiceAccountToken(
  sa: ServiceAccountConfig,
): Promise<ServiceAccountTokenResult> {
  const key = cacheKey(sa);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return { accessToken: cached.accessToken, expiresAt: cached.expiresAt };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  const header = toBase64UrlJson({ alg: "RS256", typ: "JWT" });
  const claims = toBase64UrlJson({
    iss: sa.clientEmail,
    sub: sa.impersonateEmail || undefined,
    scope: sa.scopes.join(" "),
    aud: GOOGLE_TOKEN_URL,
    iat: nowSec,
    exp: nowSec + JWT_LIFETIME_SEC,
  });
  const signingInput = `${header}.${claims}`;

  let signature: Buffer;
  try {
    const privateKey = createPrivateKey(sa.privateKey);
    signature = cryptoSign("RSA-SHA256", Buffer.from(signingInput, "utf8"), privateKey);
  } catch (err) {
    return { error: `Invalid private key: ${err instanceof Error ? err.message : String(err)}` };
  }

  const assertion = `${signingInput}.${toBase64Url(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    return {
      error: `Token endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { error: `Token exchange failed (${res.status}): ${text.slice(0, 300)}` };
  }

  const data = (await res.json()) as Record<string, string | number>;
  const accessToken = String(data.access_token ?? "");
  const expiresIn = Number(data.expires_in) || JWT_LIFETIME_SEC;
  const expiresAt = Date.now() + expiresIn * 1000;

  if (!accessToken) {
    return { error: "Token endpoint returned empty access_token" };
  }

  tokenCache.set(key, { accessToken, expiresAt });

  return { accessToken, expiresAt };
}

/** Evict a single cached token by service account config. */
export function evictTokenCache(sa: ServiceAccountConfig): void {
  tokenCache.delete(cacheKey(sa));
}

/** Clear all cached tokens (for testing). */
export function clearTokenCache(): void {
  tokenCache.clear();
}
