import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../gateway-rpc", () => ({
  gatewayRpc: vi.fn(),
}));

import { gatewayRpc } from "../gateway-rpc";
import { saveConfigPatch } from "../save-config";

const mockGatewayRpc = vi.mocked(gatewayRpc);

describe("saveConfigPatch", () => {
  beforeEach(() => {
    mockGatewayRpc.mockReset();
  });
  it("returns ok:true when get + patch both succeed", async () => {
    mockGatewayRpc
      .mockResolvedValueOnce({ ok: true, payload: { hash: "abc123" } })
      .mockResolvedValueOnce({ ok: true, payload: {} });
    const result = await saveConfigPatch({ foo: "bar" });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false needsAuth:true on AUTH_REQUIRED from get", async () => {
    mockGatewayRpc.mockResolvedValueOnce({
      ok: false,
      error: "Auth required",
      code: "AUTH_REQUIRED",
    });
    const result = await saveConfigPatch({ foo: "bar" });
    expect(result).toEqual({ ok: false, error: "Auth required", needsAuth: true });
  });

  it("returns ok:false when get fails for other reason", async () => {
    mockGatewayRpc.mockResolvedValueOnce({
      ok: false,
      error: "Server error",
    });
    const result = await saveConfigPatch({ foo: "bar" });
    expect(result).toEqual({ ok: false, error: "Server error", needsAuth: false });
  });

  it("returns ok:false when get succeeds but no hash", async () => {
    mockGatewayRpc.mockResolvedValueOnce({
      ok: true,
      payload: {},
    });
    const result = await saveConfigPatch({ foo: "bar" });
    expect(result).toEqual({ ok: false, error: "Config hash unavailable", needsAuth: false });
  });

  it("returns ok:false needsAuth:true on AUTH_REQUIRED from patch", async () => {
    mockGatewayRpc
      .mockResolvedValueOnce({ ok: true, payload: { hash: "abc" } })
      .mockResolvedValueOnce({
        ok: false,
        error: "Token expired",
        code: "AUTH_REQUIRED",
      });
    const result = await saveConfigPatch({ foo: "bar" });
    expect(result).toEqual({ ok: false, error: "Token expired", needsAuth: true });
  });

  it("passes baseHash from get to patch", async () => {
    mockGatewayRpc
      .mockResolvedValueOnce({ ok: true, payload: { hash: "hash-xyz" } })
      .mockResolvedValueOnce({ ok: true, payload: {} });
    await saveConfigPatch({ key: "val" });
    const patchCall = mockGatewayRpc.mock.calls[1];
    expect(patchCall[0]).toBe("config.patch");
    const params = patchCall[1] as Record<string, unknown>;
    expect(params.baseHash).toBe("hash-xyz");
  });

  it("passes configPatch as raw JSON string", async () => {
    mockGatewayRpc
      .mockResolvedValueOnce({ ok: true, payload: { hash: "h" } })
      .mockResolvedValueOnce({ ok: true, payload: {} });
    const patch = { plugins: { alpaca: { apiKey: "test" } } };
    await saveConfigPatch(patch);
    const patchCall = mockGatewayRpc.mock.calls[1];
    const params = patchCall[1] as Record<string, unknown>;
    expect(params.raw).toBe(JSON.stringify(patch));
  });
});
