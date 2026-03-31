import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_RETRY_STATE,
  isTransientRpcError,
  isTransientToolError,
  retryAsync,
  retryToolInvoke,
} from "../retry";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── isTransientToolError ────────────────────────────────────────────

describe("isTransientToolError", () => {
  it("returns true for 'Gateway not reachable'", () => {
    expect(isTransientToolError("Gateway not reachable")).toBe(true);
  });

  it("returns true for 'Request timed out'", () => {
    expect(isTransientToolError("Request timed out")).toBe(true);
  });

  it("returns true for 'Request failed (503)'", () => {
    expect(isTransientToolError("Request failed (503)")).toBe(true);
  });

  it("returns true for 'rate limit'", () => {
    expect(isTransientToolError("rate limit exceeded")).toBe(true);
  });

  it("returns false for 'not_implemented'", () => {
    expect(isTransientToolError("not_implemented")).toBe(false);
  });

  it("returns false for 'denied by policy'", () => {
    expect(isTransientToolError("denied by policy")).toBe(false);
  });

  it("returns false for 'kill switch active'", () => {
    expect(isTransientToolError("kill switch active")).toBe(false);
  });

  it("returns false for errorType 'not_found' regardless of message", () => {
    expect(isTransientToolError("Request timed out", "not_found")).toBe(false);
  });

  it("returns false for errorType 'tool_call_blocked'", () => {
    expect(isTransientToolError("some error", "tool_call_blocked")).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(isTransientToolError("GATEWAY NOT REACHABLE")).toBe(true);
    expect(isTransientToolError("REQUEST TIMED OUT")).toBe(true);
  });
});

// ── isTransientRpcError ─────────────────────────────────────────────

describe("isTransientRpcError", () => {
  it("returns true for 'Gateway not reachable'", () => {
    expect(isTransientRpcError("Gateway not reachable")).toBe(true);
  });

  it("returns true for 'Request timed out'", () => {
    expect(isTransientRpcError("Request timed out")).toBe(true);
  });

  it("returns true for 'Request failed (503)'", () => {
    expect(isTransientRpcError("Request failed (503)")).toBe(true);
  });

  it("returns true for 'rate limit'", () => {
    expect(isTransientRpcError("rate limit exceeded")).toBe(true);
  });

  it("returns false for 'not_implemented'", () => {
    expect(isTransientRpcError("not_implemented")).toBe(false);
  });

  it("returns false for 'denied by policy'", () => {
    expect(isTransientRpcError("denied by policy")).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(isTransientRpcError("RATE LIMIT EXCEEDED")).toBe(true);
  });
});

// ── retryToolInvoke ─────────────────────────────────────────────────

describe("retryToolInvoke", () => {
  it("returns immediately on success (1 attempt)", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, result: "done" });
    const { result, attempts } = await retryToolInvoke(fn);
    expect(result).toEqual({ ok: true, result: "done" });
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry permanent errors (1 attempt)", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      error: "denied by policy",
    });
    const { result, attempts } = await retryToolInvoke(fn);
    expect(result.ok).toBe(false);
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors up to maxAttempts", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      error: "Gateway not reachable",
    });
    const promise = retryToolInvoke(fn, { maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(20_000);
    const { attempts } = await promise;
    expect(attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("returns last result after exhausting attempts", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      error: "Request timed out",
    });
    const promise = retryToolInvoke(fn, { maxAttempts: 2 });
    await vi.advanceTimersByTimeAsync(20_000);
    const { result, attempts } = await promise;
    expect(result.ok).toBe(false);
    expect(attempts).toBe(2);
  });

  it("calls onRetry callback on each retry", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      error: "Gateway not reachable",
    });
    const onRetry = vi.fn();
    const promise = retryToolInvoke(fn, { maxAttempts: 3 }, onRetry);
    await vi.advanceTimersByTimeAsync(20_000);
    await promise;
    // onRetry called before retries 2 and 3 (not the last one)
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, "Gateway not reachable");
    expect(onRetry).toHaveBeenCalledWith(2, "Gateway not reachable");
  });

  it("succeeds on second attempt after transient error", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Request timed out" })
      .mockResolvedValueOnce({ ok: true, result: "success" });
    const promise = retryToolInvoke(fn);
    await vi.advanceTimersByTimeAsync(20_000);
    const { result, attempts } = await promise;
    expect(result).toEqual({ ok: true, result: "success" });
    expect(attempts).toBe(2);
  });

  it("defaults to 3 maxAttempts", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      error: "Gateway not reachable",
    });
    const promise = retryToolInvoke(fn);
    await vi.advanceTimersByTimeAsync(30_000);
    const { attempts } = await promise;
    expect(attempts).toBe(3);
  });
});

// ── retryAsync ──────────────────────────────────────────────────────

describe("retryAsync", () => {
  it("returns value on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryAsync(fn, () => true);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries when isRetryable returns true", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("recovered");
    const promise = retryAsync(fn, () => true, { maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately when not retryable", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));
    await expect(retryAsync(fn, () => false)).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting attempts", async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      throw new Error("still broken");
    });
    const promise = retryAsync(fn, () => true, { maxAttempts: 2 });
    // Attach the rejection handler immediately to prevent unhandled rejection
    const caught = promise.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const err = await caught;
    expect(err.message).toBe("still broken");
    expect(callCount).toBe(2);
  });
});

// ── INITIAL_RETRY_STATE ─────────────────────────────────────────────

describe("INITIAL_RETRY_STATE", () => {
  it("has expected defaults", () => {
    expect(INITIAL_RETRY_STATE).toEqual({
      attempt: 0,
      maxAttempts: 3,
      retrying: false,
    });
  });
});
