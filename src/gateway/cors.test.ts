import { describe, expect, it, vi } from "vitest";
import { handleCors } from "./cors.js";

type MockReq = { method: string; headers: Record<string, string> };
type MockRes = {
  setHeader: ReturnType<typeof vi.fn>;
  writeHead: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  _headers: Record<string, string>;
};

function makeReq(method: string, origin?: string): MockReq {
  return { method, headers: origin ? { origin } : {} };
}

function makeRes(): MockRes {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    writeHead: vi.fn(),
    end: vi.fn(),
    _headers: headers,
  };
}

// handleCors accepts IncomingMessage/ServerResponse but we pass lightweight stubs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
const cors = (req: MockReq, res: MockRes, cfg: unknown) =>
  handleCors(req as never, res as never, cfg as Parameters<typeof handleCors>[2]);

describe("handleCors", () => {
  it("sets no headers when config undefined", () => {
    const res = makeRes();
    const result = cors(makeReq("GET", "https://evil.com"), res, undefined);
    expect(result).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("sets no headers when allowedOrigins empty", () => {
    const res = makeRes();
    const result = cors(makeReq("GET", "https://evil.com"), res, {
      allowedOrigins: [],
    });
    expect(result).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("sets no headers when request has no Origin header", () => {
    const res = makeRes();
    const result = cors(makeReq("GET"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(result).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("sets CORS headers for allowed origin on GET", () => {
    const res = makeRes();
    const result = cors(makeReq("GET", "https://app.tigerpaw.ai"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(result).toBe(false);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "https://app.tigerpaw.ai",
    );
    expect(res.setHeader).toHaveBeenCalledWith("Vary", "Origin");
  });

  it("returns true + sends 204 for allowed origin on OPTIONS preflight", () => {
    const res = makeRes();
    const result = cors(makeReq("OPTIONS", "https://app.tigerpaw.ai"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(result).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it("returns true + sends 403 for disallowed origin on OPTIONS", () => {
    const res = makeRes();
    const result = cors(makeReq("OPTIONS", "https://evil.com"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(result).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(403);
  });

  it("does NOT set headers for disallowed origin on non-preflight", () => {
    const res = makeRes();
    const result = cors(makeReq("GET", "https://evil.com"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(result).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("is case-sensitive", () => {
    const res = makeRes();
    const result = cors(makeReq("GET", "https://APP.TIGERPAW.AI"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(result).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
