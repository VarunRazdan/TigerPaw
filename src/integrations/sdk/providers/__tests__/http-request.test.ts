/**
 * Tests for the HTTP Request integration provider.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAction } from "../../registry.js";
import type { AuthContext } from "../../types.js";

// Mock _utils — intercept fetchWithTimeout but keep the real validateUrl for SSRF tests
vi.mock("../_utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../_utils.js")>();
  return {
    ...original,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "../_utils.js";

const mockFetch = vi.mocked(fetchWithTimeout);

function stubAuth(): AuthContext {
  return {
    getAccessToken: async () => "",
    getCredentialField: () => undefined,
    credentials: {},
  };
}

function makeResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  const headersObj = new Headers({
    "content-type": "application/json",
    ...headers,
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: headersObj,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

// Load once — module caching means re-import is a no-op
import "../http-request.js";

// Grab the execute function once at module scope
const action = getAction("http", "http.request")!;
const execute = action.execute;

describe("HTTP Request Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("makes a GET request with correct URL", async () => {
    mockFetch.mockResolvedValue(makeResponse({ data: "ok" }));

    const result = await execute({ url: "https://api.example.com/data" }, stubAuth());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ data: "ok" });
  });

  it("makes a POST request with JSON body and Content-Type header", async () => {
    mockFetch.mockResolvedValue(makeResponse({ created: true }, 201));

    const result = await execute(
      {
        url: "https://api.example.com/items",
        method: "POST",
        body: { name: "test" },
      },
      stubAuth(),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result.status).toBe(201);
  });

  // ── SSRF protection ─────────────────────────────────────────────

  describe("SSRF protection", () => {
    it("blocks requests to 127.0.0.1", async () => {
      await expect(execute({ url: "http://127.0.0.1/admin" }, stubAuth())).rejects.toThrow(
        /Blocked URL|private|internal/i,
      );
    });

    it("blocks requests to 10.x.x.x private ranges", async () => {
      await expect(execute({ url: "http://10.0.0.1/internal" }, stubAuth())).rejects.toThrow(
        /Blocked URL|private|internal/i,
      );
    });

    it("blocks requests to AWS metadata endpoint 169.254.169.254", async () => {
      await expect(
        execute({ url: "http://169.254.169.254/latest/meta-data/" }, stubAuth()),
      ).rejects.toThrow(/Blocked URL|not allowed|169\.254/i);
    });

    it("blocks non-HTTP schemes like ftp://", async () => {
      await expect(execute({ url: "ftp://files.example.com/secret" }, stubAuth())).rejects.toThrow(
        /Blocked URL scheme|only http|scheme/i,
      );
    });

    it("blocks non-HTTP schemes like file://", async () => {
      await expect(execute({ url: "file:///etc/passwd" }, stubAuth())).rejects.toThrow(
        /Blocked URL scheme|only http|scheme/i,
      );
    });
  });

  // ── Retries ─────────────────────────────────────────────────────

  it("retries on failure up to retryCount", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(makeResponse({ recovered: true }));

    const result = await execute(
      { url: "https://api.example.com/data", retryCount: 2 },
      stubAuth(),
    );

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ recovered: true });
  });

  it("throws after exhausting all retries", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      execute({ url: "https://api.example.com/data", retryCount: 1 }, stubAuth()),
    ).rejects.toThrow("Network error");
  });

  // ── Timeout ─────────────────────────────────────────────────────

  it("passes timeout to fetchWithTimeout", async () => {
    mockFetch.mockResolvedValue(makeResponse({ ok: true }));

    await execute({ url: "https://api.example.com/data", timeout: 5000 }, stubAuth());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });

  it("throws on timeout", async () => {
    mockFetch.mockRejectedValue(new Error("Request timed out after 5000ms"));

    await expect(
      execute({ url: "https://api.example.com/slow", timeout: 5000 }, stubAuth()),
    ).rejects.toThrow(/timed out/i);
  });

  // ── Auth headers ────────────────────────────────────────────────

  it("adds Bearer Authorization header when authType is bearer with token", async () => {
    mockFetch.mockResolvedValue(makeResponse({ authed: true }));

    await execute(
      {
        url: "https://api.example.com/secure",
        authType: "bearer",
        authToken: "my-bearer-token",
      },
      stubAuth(),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/secure",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer my-bearer-token",
        }),
      }),
    );
  });

  it("does not add Authorization header when authToken is empty", async () => {
    mockFetch.mockResolvedValue(makeResponse({ ok: true }));

    await execute(
      {
        url: "https://api.example.com/public",
        authType: "bearer",
        authToken: "",
      },
      stubAuth(),
    );

    const callArgs = mockFetch.mock.calls[0];
    const requestOpts = callArgs[1] as RequestInit & { timeoutMs?: number };
    const headers = requestOpts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
