/**
 * Generic retry utility with exponential backoff + jitter.
 *
 * Used by order submission, position closing, and liquidation flows
 * to automatically retry transient failures (network timeouts, gateway
 * unreachable, rate limits) while immediately surfacing permanent errors
 * (policy denial, missing extensions, business-logic rejections).
 */

import type { ToolInvokeResult } from "./gateway-http";

// ── Configuration ────────────────────────────────────────────────

export type RetryConfig = {
  /** Total attempts including the initial try (default 3). */
  maxAttempts?: number;
  /** Base delay in ms before first retry (default 1000). */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default 5000). */
  maxDelayMs?: number;
};

export type RetryState = {
  attempt: number;
  maxAttempts: number;
  retrying: boolean;
};

const DEFAULTS: Required<RetryConfig> = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 5_000,
};

// ── Transient-error classification ───────────────────────────────

/** Error types from the gateway that should never be retried. */
const PERMANENT_ERROR_TYPES = new Set(["not_found", "tool_call_blocked"]);

/** Substrings in error messages that indicate a permanent / business-logic failure. */
const PERMANENT_SUBSTRINGS = [
  "not_implemented",
  "not implemented",
  "no_policy_engine",
  "policy engine not configured",
  "denied",
  "blocked",
  "rejected",
  "unknown platform",
  "not available",
  "kill switch",
];

/** Substrings that indicate a transient / infrastructure failure. */
const TRANSIENT_SUBSTRINGS = [
  "timed out",
  "timeout",
  "not reachable",
  "network",
  "econnrefused",
  "econnreset",
  "enotfound",
  "request failed",
  "temporarily unavailable",
  "rate limit",
  "throttl",
  "too many requests",
  "500",
  "502",
  "503",
  "504",
  "429",
];

/**
 * Returns true when an HTTP tool invocation error is transient and
 * the request is safe to retry.
 */
export function isTransientToolError(error: string, errorType?: string): boolean {
  if (errorType && PERMANENT_ERROR_TYPES.has(errorType)) {
    return false;
  }

  const lower = error.toLowerCase();

  // Explicit permanent checks first
  for (const s of PERMANENT_SUBSTRINGS) {
    if (lower.includes(s)) {
      return false;
    }
  }

  // Then transient checks
  for (const s of TRANSIENT_SUBSTRINGS) {
    if (lower.includes(s)) {
      return true;
    }
  }

  // Unknown error shape — don't retry to be safe
  return false;
}

/**
 * Returns true when a gateway RPC error message is transient.
 * Used by the trading store (liquidateAll) and workflow trade action.
 */
export function isTransientRpcError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  for (const s of PERMANENT_SUBSTRINGS) {
    if (lower.includes(s)) {
      return false;
    }
  }
  for (const s of TRANSIENT_SUBSTRINGS) {
    if (lower.includes(s)) {
      return true;
    }
  }
  return false;
}

// ── Delay helpers ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with ±25 % jitter to prevent thundering-herd
 * when multiple orders retry against the same gateway.
 */
function jitteredDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = baseMs * 2 ** attempt;
  const capped = Math.min(exponential, maxMs);
  const jitter = capped * (0.75 + Math.random() * 0.5); // ±25%
  return Math.round(jitter);
}

// ── Core retry wrapper (UI / ToolInvokeResult) ───────────────────

/**
 * Retry a tool invocation that returns `ToolInvokeResult`.
 * Retries only when the result is `{ ok: false }` with a transient error.
 *
 * Returns the final result plus the number of attempts made.
 */
export async function retryToolInvoke<T = unknown>(
  fn: () => Promise<ToolInvokeResult<T>>,
  config?: RetryConfig,
  onRetry?: (attempt: number, error: string) => void,
): Promise<{ result: ToolInvokeResult<T>; attempts: number }> {
  const opts = { ...DEFAULTS, ...config };

  let lastResult: ToolInvokeResult<T>;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    lastResult = await fn();

    // Success or permanent failure → stop
    if (lastResult.ok || !isTransientToolError(lastResult.error, lastResult.errorType)) {
      return { result: lastResult, attempts: attempt + 1 };
    }

    // Last attempt — don't sleep, just return
    if (attempt === opts.maxAttempts - 1) {
      break;
    }

    onRetry?.(attempt + 1, lastResult.error);
    await sleep(jitteredDelay(attempt, opts.baseDelayMs, opts.maxDelayMs));
  }

  return { result: lastResult!, attempts: opts.maxAttempts };
}

// ── Core retry wrapper (server-side / throws) ────────────────────

/**
 * Retry an async function that signals failure by throwing.
 * Only retries when `isRetryable(error)` returns true.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  config?: RetryConfig,
): Promise<T> {
  const opts = { ...DEFAULTS, ...config };

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === opts.maxAttempts - 1 || !isRetryable(err)) {
        throw err;
      }
      await sleep(jitteredDelay(attempt, opts.baseDelayMs, opts.maxDelayMs));
    }
  }

  // Unreachable — the loop either returns or re-throws
  throw new Error("retry: exhausted attempts");
}

export const INITIAL_RETRY_STATE: RetryState = {
  attempt: 0,
  maxAttempts: DEFAULTS.maxAttempts,
  retrying: false,
};
