import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lightweight mock WebSocket that supports addEventListener
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  sent: string[] = [];
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async connection
    setTimeout(() => this.emit("open"), 0);
  }

  addEventListener(event: string, handler: (...args: unknown[]) => void) {
    (this.listeners[event] ??= []).push(handler);
  }

  private emit(event: string, ...args: unknown[]) {
    for (const handler of this.listeners[event] ?? []) {
      handler(...args);
    }
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  // Test helpers
  simulateMessage(frame: Record<string, unknown>) {
    this.emit("message", { data: JSON.stringify(frame) });
  }

  simulateError() {
    this.emit("error");
  }

  simulateClose() {
    this.emit("close");
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("window", {
    location: { port: "5174", protocol: "http:", host: "localhost:5174" },
  });
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe("gatewayRpc", () => {
  async function loadModule() {
    return import("../gateway-rpc");
  }

  function getWs(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  /** Drive the full handshake: challenge -> connect-ok -> RPC response */
  function driveHandshake(ws: MockWebSocket, rpcPayload: unknown) {
    // Server sends challenge
    ws.simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "test-nonce" },
    });
    // Parse connect request to get its id
    const connectReq = JSON.parse(ws.sent[0]);
    // Server sends hello-ok
    ws.simulateMessage({
      type: "res",
      id: connectReq.id,
      ok: true,
      payload: { version: 3 },
    });
    // Parse RPC request to get its id
    const rpcReq = JSON.parse(ws.sent[1]);
    // Server sends RPC response
    ws.simulateMessage({
      type: "res",
      id: rpcReq.id,
      ok: true,
      payload: rpcPayload,
    });
  }

  it("connects to ws://127.0.0.1:18789 on Vite dev port", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("config.get", {});
    await vi.advanceTimersByTimeAsync(1);
    const ws = getWs();
    expect(ws.url).toBe("ws://127.0.0.1:18789");
    driveHandshake(ws, { hash: "abc" });
    const result = await promise;
    expect(result.ok).toBe(true);
  });

  it("returns ok:true with payload on success", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("config.get", {});
    await vi.advanceTimersByTimeAsync(1);
    driveHandshake(getWs(), { hash: "abc123" });
    const result = await promise;
    expect(result).toEqual({ ok: true, payload: { hash: "abc123" } });
  });

  it("returns ok:false on WebSocket error", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("test", {});
    await vi.advanceTimersByTimeAsync(1);
    getWs().simulateError();
    const result = await promise;
    expect(result).toEqual({ ok: false, error: "Gateway not reachable" });
  });

  it("returns ok:false on premature close", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("test", {});
    await vi.advanceTimersByTimeAsync(1);
    getWs().simulateClose();
    const result = await promise;
    expect(result).toEqual({ ok: false, error: "Connection closed unexpectedly" });
  });

  it("returns ok:false on timeout", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("test", {}, { timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(1);
    // Don't complete the handshake, let it time out
    await vi.advanceTimersByTimeAsync(2500);
    const result = await promise;
    expect(result).toEqual({ ok: false, error: "Request timed out" });
  });

  it("returns ok:false on empty challenge nonce", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("test", {});
    await vi.advanceTimersByTimeAsync(1);
    getWs().simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "" },
    });
    const result = await promise;
    expect(result).toEqual({ ok: false, error: "Invalid challenge from gateway" });
  });

  it("returns ok:false with AUTH_REQUIRED code on auth failure", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("test", {});
    await vi.advanceTimersByTimeAsync(1);
    const ws = getWs();
    ws.simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "n" },
    });
    const connectReq = JSON.parse(ws.sent[0]);
    ws.simulateMessage({
      type: "res",
      id: connectReq.id,
      ok: false,
      error: { code: "AUTH_REQUIRED", message: "Token required" },
    });
    const result = await promise;
    expect(result).toEqual({
      ok: false,
      error: "Token required",
      code: "AUTH_REQUIRED",
    });
  });

  it("sends connect request after challenge with correct params", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("config.get", {}, { token: "my-token" });
    await vi.advanceTimersByTimeAsync(1);
    const ws = getWs();
    ws.simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "test" },
    });
    const req = JSON.parse(ws.sent[0]);
    expect(req.method).toBe("connect");
    expect(req.params.minProtocol).toBe(3);
    expect(req.params.maxProtocol).toBe(3);
    expect(req.params.client.id).toBe("tigerpaw-control-ui");
    expect(req.params.auth).toEqual({ token: "my-token" });

    // Complete handshake to settle the promise
    ws.simulateMessage({ type: "res", id: req.id, ok: true, payload: {} });
    const rpcReq = JSON.parse(ws.sent[1]);
    ws.simulateMessage({ type: "res", id: rpcReq.id, ok: true, payload: {} });
    await promise;
  });

  it("returns ok:false on RPC error response", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("config.patch", { raw: "{}" });
    await vi.advanceTimersByTimeAsync(1);
    const ws = getWs();
    ws.simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "n" },
    });
    const connectReq = JSON.parse(ws.sent[0]);
    ws.simulateMessage({ type: "res", id: connectReq.id, ok: true, payload: {} });
    const rpcReq = JSON.parse(ws.sent[1]);
    ws.simulateMessage({
      type: "res",
      id: rpcReq.id,
      ok: false,
      error: { code: "CONFLICT", message: "Hash mismatch" },
    });
    const result = await promise;
    expect(result).toEqual({
      ok: false,
      error: "Hash mismatch",
      code: "CONFLICT",
    });
  });

  it("ignores messages with wrong frame id", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("config.get", {});
    await vi.advanceTimersByTimeAsync(1);
    const ws = getWs();
    ws.simulateMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "n" },
    });
    const connectReq = JSON.parse(ws.sent[0]);
    ws.simulateMessage({ type: "res", id: connectReq.id, ok: true, payload: {} });

    // Send a response with a wrong id — should be ignored
    ws.simulateMessage({
      type: "res",
      id: "wrong-id",
      ok: true,
      payload: { hash: "wrong" },
    });
    // The promise should still be pending — send the correct one
    const rpcReq = JSON.parse(ws.sent[1]);
    ws.simulateMessage({
      type: "res",
      id: rpcReq.id,
      ok: true,
      payload: { hash: "correct" },
    });
    const result = await promise;
    expect(result).toEqual({ ok: true, payload: { hash: "correct" } });
  });

  it("cleans up WebSocket on completion", async () => {
    const { gatewayRpc } = await loadModule();
    const promise = gatewayRpc("test", {});
    await vi.advanceTimersByTimeAsync(1);
    const ws = getWs();
    driveHandshake(ws, { done: true });
    await promise;
    expect(ws.closed).toBe(true);
  });
});
