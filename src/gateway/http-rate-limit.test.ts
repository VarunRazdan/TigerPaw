import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the net module before importing the limiter.
vi.mock("./net.js", () => ({
  resolveClientIp: (params: { remoteAddr: string | undefined }) => params.remoteAddr ?? "unknown",
  isLoopbackAddress: (ip: string) => ip === "127.0.0.1" || ip === "::1",
}));

import { createHttpRateLimiter } from "./http-rate-limit.js";

describe("createHttpRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic allow/deny", () => {
    it("allows requests under window limit", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 5,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      const result = limiter.consume("10.0.0.1", "/api/orders");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      limiter.dispose();
    });

    it("denies at maxRequestsPerWindow", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 3,
        maxBurstPerSecond: 100,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api");
      limiter.consume("10.0.0.1", "/api");
      limiter.consume("10.0.0.1", "/api");
      const result = limiter.consume("10.0.0.1", "/api");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      limiter.dispose();
    });

    it("returns retryAfterMs > 0 when limited", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 1,
        maxBurstPerSecond: 100,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api");
      const result = limiter.consume("10.0.0.1", "/api");
      expect(result.retryAfterMs).toBeGreaterThan(0);
      limiter.dispose();
    });

    it("allows again after window slides forward", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 1,
        windowMs: 1000,
        maxBurstPerSecond: 100,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api");
      expect(limiter.consume("10.0.0.1", "/api").allowed).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(limiter.consume("10.0.0.1", "/api").allowed).toBe(true);
      limiter.dispose();
    });
  });

  describe("burst limiting", () => {
    it("denies when maxBurstPerSecond exceeded within 1s", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 100,
        maxBurstPerSecond: 2,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api");
      limiter.consume("10.0.0.1", "/api");
      const result = limiter.consume("10.0.0.1", "/api");
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(1000);
      limiter.dispose();
    });

    it("burst resets after 1 second", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 100,
        maxBurstPerSecond: 2,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api");
      limiter.consume("10.0.0.1", "/api");
      expect(limiter.consume("10.0.0.1", "/api").allowed).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(limiter.consume("10.0.0.1", "/api").allowed).toBe(true);
      limiter.dispose();
    });
  });

  describe("exempt paths", () => {
    it("always allows /health, /healthz, /ready, /readyz", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 1,
        maxBurstPerSecond: 1,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      // Exhaust the window
      limiter.consume("10.0.0.1", "/api");
      // Health paths still allowed
      for (const p of ["/health", "/healthz", "/ready", "/readyz"]) {
        expect(limiter.consume("10.0.0.1", p).allowed).toBe(true);
      }
      limiter.dispose();
    });

    it("does NOT exempt /api/orders", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 1,
        maxBurstPerSecond: 100,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api/orders");
      expect(limiter.consume("10.0.0.1", "/api/orders").allowed).toBe(false);
      limiter.dispose();
    });
  });

  describe("loopback exemption", () => {
    it("exempts loopback IPs when exemptLoopback=true", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 1,
        maxBurstPerSecond: 1,
        exemptLoopback: true,
        pruneIntervalMs: 0,
      });
      limiter.consume("127.0.0.1", "/api");
      // Still allowed because loopback is exempt
      expect(limiter.consume("127.0.0.1", "/api").allowed).toBe(true);
      limiter.dispose();
    });

    it("rate-limits loopback when exemptLoopback=false", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 1,
        maxBurstPerSecond: 100,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("127.0.0.1", "/api");
      expect(limiter.consume("127.0.0.1", "/api").allowed).toBe(false);
      limiter.dispose();
    });
  });

  describe("per-IP isolation", () => {
    it("tracks different IPs independently", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 1,
        maxBurstPerSecond: 100,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api");
      expect(limiter.consume("10.0.0.1", "/api").allowed).toBe(false);
      expect(limiter.consume("10.0.0.2", "/api").allowed).toBe(true);
      limiter.dispose();
    });
  });

  describe("prune / dispose", () => {
    it("prune removes expired entries", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 100,
        windowMs: 1000,
        exemptLoopback: false,
        pruneIntervalMs: 0,
      });
      limiter.consume("10.0.0.1", "/api");
      expect(limiter.size()).toBe(1);
      vi.advanceTimersByTime(1001);
      limiter.prune();
      expect(limiter.size()).toBe(0);
      limiter.dispose();
    });

    it("dispose clears state and stops timer", () => {
      const limiter = createHttpRateLimiter({
        maxRequestsPerWindow: 100,
        exemptLoopback: false,
        pruneIntervalMs: 1000,
      });
      limiter.consume("10.0.0.1", "/api");
      expect(limiter.size()).toBe(1);
      limiter.dispose();
      expect(limiter.size()).toBe(0);
    });
  });
});
