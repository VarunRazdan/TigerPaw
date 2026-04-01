/**
 * Shared utilities for SDK integration providers.
 *
 * Provides fetch with timeout, URL validation (SSRF protection),
 * and response size limiting.
 */

// ── SSRF Protection ─────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254", // AWS/GCP metadata
  "metadata.azure.com",
]);

/**
 * Check if an IP address is in a private/reserved range.
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith("127.")) {
    return true;
  } // 127.0.0.0/8
  if (ip.startsWith("10.")) {
    return true;
  } // 10.0.0.0/8
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
    return true;
  } // 172.16.0.0/12
  if (ip.startsWith("192.168.")) {
    return true;
  } // 192.168.0.0/16
  if (ip.startsWith("169.254.")) {
    return true;
  } // 169.254.0.0/16 (link-local)
  if (ip.startsWith("0.")) {
    return true;
  } // 0.0.0.0/8
  // IPv6 private
  if (ip === "::1" || ip === "::") {
    return true;
  }
  if (/^f[cd]/i.test(ip)) {
    return true;
  } // fc00::/7 (unique local)
  if (/^fe80/i.test(ip)) {
    return true;
  } // fe80::/10 (link-local)
  return false;
}

/**
 * Validate a URL for safety (blocks SSRF to internal networks).
 * Throws if the URL is blocked.
 */
export function validateUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString.slice(0, 100)}`);
  }

  // Block non-HTTP schemes
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked URL scheme: ${url.protocol} (only http/https allowed)`);
  }

  // Block known metadata hostnames
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new Error(`Blocked URL: requests to ${url.hostname} are not allowed`);
  }

  // Block private IPs
  if (isPrivateIp(url.hostname)) {
    throw new Error(`Blocked URL: requests to private/internal networks are not allowed`);
  }

  return url;
}

// ── Fetch with timeout and size limit ───────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Fetch with timeout and optional response size limit.
 * All SDK providers should use this instead of raw `fetch()`.
 */
export async function fetchWithTimeout(
  url: string,
  opts?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url.slice(0, 100)}`, {
        cause: err,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read response body as JSON with size limit.
 */
export async function readJsonResponse(
  res: Response,
  maxSize = MAX_RESPONSE_SIZE,
): Promise<Record<string, unknown>> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxSize) {
    throw new Error(`Response too large: ${contentLength} bytes (max: ${maxSize})`);
  }

  const text = await res.text();
  if (text.length > maxSize) {
    throw new Error(`Response too large: ${text.length} bytes (max: ${maxSize})`);
  }

  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Format an API error with status code and truncated body.
 * Ensures no sensitive data leaks in error messages.
 */
export function formatApiError(provider: string, status: number, body: string): string {
  // Truncate and sanitize error body
  const safeBody = body.slice(0, 200).replace(/["']?[A-Za-z0-9_-]{20,}["']?/g, "[REDACTED]");
  return `${provider} API error (${status}): ${safeBody}`;
}

/**
 * Safely convert an unknown value to string.
 * Avoids the no-base-to-string lint error on Record<string, unknown> values.
 */
export function str(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value as string);
}
