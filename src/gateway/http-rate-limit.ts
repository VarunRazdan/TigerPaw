/**
 * General HTTP rate limiter for the Tigerpaw gateway.
 *
 * Provides per-IP sliding-window rate limiting for all HTTP endpoints.
 * Pattern extends auth-rate-limit.ts but targets general request volume
 * rather than authentication failures.
 *
 * Defaults: 120 requests/min, 20 requests/sec per IP.
 * Exempt: /health, /healthz, /ready, /readyz (monitoring endpoints).
 */

import { isLoopbackAddress, resolveClientIp } from "./net.js";

export type HttpRateLimitConfig = {
  /** Maximum requests per window per IP. @default 120 */
  maxRequestsPerWindow?: number;
  /** Sliding window duration in milliseconds. @default 60_000 (1 min) */
  windowMs?: number;
  /** Maximum burst (requests per second). @default 20 */
  maxBurstPerSecond?: number;
  /** Exempt loopback (localhost) from rate limiting. @default true */
  exemptLoopback?: boolean;
  /** Paths exempted from rate limiting. @default ["/health","/healthz","/ready","/readyz"] */
  exemptPaths?: string[];
  /** Background prune interval in ms. @default 60_000 */
  pruneIntervalMs?: number;
};

export type HttpRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type BucketEntry = {
  /** Timestamps of requests in the current window. */
  windowHits: number[];
  /** Timestamps of requests in the current second (burst tracking). */
  burstHits: number[];
};

const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_BURST = 20;
const DEFAULT_EXEMPT_PATHS = ["/health", "/healthz", "/ready", "/readyz"];
const DEFAULT_PRUNE_INTERVAL_MS = 60_000;

export type HttpRateLimiter = {
  /** Check + consume a request slot for the given IP and path. */
  consume(ip: string | undefined, path: string): HttpRateLimitResult;
  /** Current number of tracked IPs. */
  size(): number;
  /** Prune expired entries. */
  prune(): void;
  /** Dispose timers and clear state. */
  dispose(): void;
};

export function createHttpRateLimiter(config?: HttpRateLimitConfig): HttpRateLimiter {
  const maxRequests = config?.maxRequestsPerWindow ?? DEFAULT_MAX_REQUESTS;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxBurst = config?.maxBurstPerSecond ?? DEFAULT_MAX_BURST;
  const exemptLoopback = config?.exemptLoopback ?? true;
  const exemptPaths = new Set(config?.exemptPaths ?? DEFAULT_EXEMPT_PATHS);
  const pruneIntervalMs = config?.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL_MS;

  const entries = new Map<string, BucketEntry>();

  const pruneTimer = pruneIntervalMs > 0 ? setInterval(() => prune(), pruneIntervalMs) : null;
  if (pruneTimer?.unref) {
    pruneTimer.unref();
  }

  function normalizeIp(ip: string | undefined): string {
    return resolveClientIp({ remoteAddr: ip }) ?? "unknown";
  }

  function consume(rawIp: string | undefined, requestPath: string): HttpRateLimitResult {
    if (exemptPaths.has(requestPath)) {
      return { allowed: true, remaining: maxRequests, retryAfterMs: 0 };
    }

    const ip = normalizeIp(rawIp);
    if (exemptLoopback && isLoopbackAddress(ip)) {
      return { allowed: true, remaining: maxRequests, retryAfterMs: 0 };
    }

    const now = Date.now();
    let entry = entries.get(ip);
    if (!entry) {
      entry = { windowHits: [], burstHits: [] };
      entries.set(ip, entry);
    }

    // Slide the per-minute window.
    const windowCutoff = now - windowMs;
    entry.windowHits = entry.windowHits.filter((ts) => ts > windowCutoff);

    // Slide the per-second burst window.
    const burstCutoff = now - 1000;
    entry.burstHits = entry.burstHits.filter((ts) => ts > burstCutoff);

    // Check window limit.
    if (entry.windowHits.length >= maxRequests) {
      const oldest = entry.windowHits[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: oldest + windowMs - now,
      };
    }

    // Check burst limit.
    if (entry.burstHits.length >= maxBurst) {
      return {
        allowed: false,
        remaining: Math.max(0, maxRequests - entry.windowHits.length),
        retryAfterMs: 1000,
      };
    }

    // Allow and record.
    entry.windowHits.push(now);
    entry.burstHits.push(now);

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - entry.windowHits.length),
      retryAfterMs: 0,
    };
  }

  function prune(): void {
    const now = Date.now();
    const windowCutoff = now - windowMs;
    for (const [ip, entry] of entries) {
      entry.windowHits = entry.windowHits.filter((ts) => ts > windowCutoff);
      entry.burstHits = [];
      if (entry.windowHits.length === 0) {
        entries.delete(ip);
      }
    }
  }

  function size(): number {
    return entries.size;
  }

  function dispose(): void {
    if (pruneTimer) {
      clearInterval(pruneTimer);
    }
    entries.clear();
  }

  return { consume, size, prune, dispose };
}
