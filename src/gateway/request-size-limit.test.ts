import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  collectBodyWithLimit,
  rejectOversizedBody,
  resolveHttpBodyMaxBytes,
  resolveWsFrameMaxBytes,
} from "./request-size-limit.js";

describe("resolveHttpBodyMaxBytes", () => {
  it("returns 1MB default when no config", () => {
    expect(resolveHttpBodyMaxBytes()).toBe(1_048_576);
  });

  it("returns configured value", () => {
    expect(resolveHttpBodyMaxBytes({ httpBodyMaxBytes: 512 })).toBe(512);
  });
});

describe("resolveWsFrameMaxBytes", () => {
  it("returns 256KB default when no config", () => {
    expect(resolveWsFrameMaxBytes()).toBe(262_144);
  });

  it("returns configured value", () => {
    expect(resolveWsFrameMaxBytes({ wsFrameMaxBytes: 1024 })).toBe(1024);
  });
});

describe("rejectOversizedBody", () => {
  function makeReq(contentLength?: string) {
    return { headers: contentLength ? { "content-length": contentLength } : {} };
  }

  function makeRes() {
    return {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
  }

  // Wrapper that casts lightweight stubs to the real types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
  const reject = (req: ReturnType<typeof makeReq>, res: ReturnType<typeof makeRes>, max: number) =>
    rejectOversizedBody(req as never, res as never, max);

  it("returns false when no Content-Length header", () => {
    expect(reject(makeReq(), makeRes(), 1000)).toBe(false);
  });

  it("returns false when Content-Length within limit", () => {
    expect(reject(makeReq("500"), makeRes(), 1000)).toBe(false);
  });

  it("returns true and sends 413 when Content-Length exceeds limit", () => {
    const res = makeRes();
    expect(reject(makeReq("2000"), res, 1000)).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(413, { "Content-Type": "application/json" });
  });

  it("includes maxBytes and receivedBytes in 413 response", () => {
    const res = makeRes();
    reject(makeReq("2000"), res, 1000);
    const body = JSON.parse(res.end.mock.calls[0][0]);
    expect(body.maxBytes).toBe(1000);
    expect(body.receivedBytes).toBe(2000);
  });

  it("returns false for non-finite Content-Length", () => {
    expect(reject(makeReq("abc"), makeRes(), 1000)).toBe(false);
  });
});

describe("collectBodyWithLimit", () => {
  function makeStreamReq() {
    const emitter = new EventEmitter();
    (emitter as unknown as Record<string, unknown>).destroy = vi.fn();
    return emitter;
  }

  it("resolves with full body buffer when under limit", async () => {
    const req = makeStreamReq();
    const promise = collectBodyWithLimit(req as never, 1000);
    req.emit("data", Buffer.from("hello"));
    req.emit("data", Buffer.from(" world"));
    req.emit("end");
    const result = await promise;
    expect(result.toString()).toBe("hello world");
  });

  it("rejects when body exceeds maxBytes mid-stream", async () => {
    const req = makeStreamReq();
    const promise = collectBodyWithLimit(req as never, 5);
    req.emit("data", Buffer.from("hello world that is too long"));
    await expect(promise).rejects.toThrow("exceeds 5 bytes");
    expect((req as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled();
  });

  it("rejects on 30s timeout (slowloris protection)", async () => {
    vi.useFakeTimers();
    const req = makeStreamReq();
    const promise = collectBodyWithLimit(req as never, 1000);
    vi.advanceTimersByTime(30_001);
    await expect(promise).rejects.toThrow("timed out");
    vi.useRealTimers();
  });

  it("rejects on request error event", async () => {
    const req = makeStreamReq();
    const promise = collectBodyWithLimit(req as never, 1000);
    req.emit("error", new Error("socket hangup"));
    await expect(promise).rejects.toThrow("socket hangup");
  });
});
