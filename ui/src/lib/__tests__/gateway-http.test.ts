import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // Stub window.location — in Node there is no window, so we must stub the whole window object
  vi.stubGlobal("window", {
    location: {
      port: "5174",
      origin: "http://localhost:5174",
      protocol: "http:",
      host: "localhost:5174",
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  mockFetch.mockReset();
});

describe("invokeToolHttp", () => {
  async function loadModule() {
    return import("../gateway-http");
  }

  it("sends POST to /tools/invoke with correct body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { id: "123" } }),
    });
    const { invokeToolHttp } = await loadModule();
    await invokeToolHttp("alpaca_place_order", { symbol: "AAPL" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:18789/tools/invoke",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tool: "alpaca_place_order", args: { symbol: "AAPL" } }),
      }),
    );
  });

  it("includes Bearer token when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    const { invokeToolHttp } = await loadModule();
    await invokeToolHttp("test", {}, { token: "my-token" });
    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers["Authorization"]).toBe("Bearer my-token");
  });

  it("returns ok:true with result on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { orderId: "abc" } }),
    });
    const { invokeToolHttp } = await loadModule();
    const result = await invokeToolHttp("test", {});
    expect(result).toEqual({ ok: true, result: { orderId: "abc" } });
  });

  it("returns ok:false with error on non-200", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: "Internal error", type: "server_error" } }),
    });
    const { invokeToolHttp } = await loadModule();
    const result = await invokeToolHttp("test", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Internal error");
      expect(result.errorType).toBe("server_error");
    }
  });

  it("returns 'Gateway not reachable' on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const { invokeToolHttp } = await loadModule();
    const result = await invokeToolHttp("test", {});
    expect(result).toEqual({ ok: false, error: "Gateway not reachable" });
  });

  it("uses port 18789 on Vite dev port 5174", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    const { invokeToolHttp } = await loadModule();
    await invokeToolHttp("test", {});
    expect(mockFetch.mock.calls[0][0]).toContain("127.0.0.1:18789");
  });
});
