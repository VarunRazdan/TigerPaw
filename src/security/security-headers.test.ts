/**
 * Security headers tests.
 *
 * Verify that CORS, CSP, and other security headers are set correctly
 * by the gateway HTTP layer. Tests use lightweight mocks of
 * IncomingMessage / ServerResponse to exercise the header-setting logic
 * without spawning a full HTTP server.
 */

import { describe, expect, it, vi } from "vitest";
import { buildControlUiCspHeader } from "../gateway/control-ui-csp.js";
import { handleCors, type CorsConfig } from "../gateway/cors.js";
import { setDefaultSecurityHeaders } from "../gateway/http-common.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockReq = {
  method: string;
  headers: Record<string, string | undefined>;
};

type MockRes = {
  statusCode: number;
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
    statusCode: 200,
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    writeHead: vi.fn(),
    end: vi.fn(),
    _headers: headers,
  };
}

const cors = (req: MockReq, res: MockRes, cfg: CorsConfig | undefined) =>
  handleCors(req as never, res as never, cfg);

// ---------------------------------------------------------------------------
// CORS tests
// ---------------------------------------------------------------------------

describe("security-headers: CORS enforcement", () => {
  it("sends no CORS headers when allowlist is not configured", () => {
    const res = makeRes();
    const handled = cors(makeReq("GET", "https://evil.example.com"), res, undefined);
    expect(handled).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("sets Access-Control-Allow-Origin for an allowed origin", () => {
    const res = makeRes();
    const handled = cors(makeReq("GET", "https://app.tigerpaw.ai"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(handled).toBe(false);
    expect(res._headers["Access-Control-Allow-Origin"]).toBe("https://app.tigerpaw.ai");
  });

  it("rejects disallowed origin on normal request (no CORS headers set)", () => {
    const res = makeRes();
    const handled = cors(makeReq("GET", "https://evil.example.com"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(handled).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("responds 204 for OPTIONS preflight on allowed origin", () => {
    const res = makeRes();
    const handled = cors(makeReq("OPTIONS", "https://app.tigerpaw.ai"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it("responds 403 for OPTIONS preflight on disallowed origin", () => {
    const res = makeRes();
    const handled = cors(makeReq("OPTIONS", "https://evil.example.com"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(403);
  });

  it("does NOT use wildcard * in Access-Control-Allow-Origin", () => {
    const res = makeRes();
    cors(makeReq("GET", "https://app.tigerpaw.ai"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(res._headers["Access-Control-Allow-Origin"]).not.toBe("*");
  });

  it("includes Vary: Origin header for allowed origins", () => {
    const res = makeRes();
    cors(makeReq("GET", "https://app.tigerpaw.ai"), res, {
      allowedOrigins: ["https://app.tigerpaw.ai"],
    });
    expect(res._headers.Vary).toBe("Origin");
  });
});

// ---------------------------------------------------------------------------
// CSP tests
// ---------------------------------------------------------------------------

describe("security-headers: Content Security Policy", () => {
  const csp = buildControlUiCspHeader();

  it("builds a non-empty CSP header string", () => {
    expect(typeof csp).toBe("string");
    expect(csp.length).toBeGreaterThan(0);
  });

  it("includes frame-ancestors 'none' to prevent clickjacking", () => {
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("includes script-src 'self' to prevent XSS via inline scripts", () => {
    expect(csp).toContain("script-src 'self'");
  });

  it("includes base-uri 'none' to prevent base tag hijacking", () => {
    expect(csp).toContain("base-uri 'none'");
  });

  it("includes object-src 'none' to prevent plugin-based attacks", () => {
    expect(csp).toContain("object-src 'none'");
  });
});

// ---------------------------------------------------------------------------
// Default security headers
// ---------------------------------------------------------------------------

describe("security-headers: default security headers", () => {
  it("sets X-Content-Type-Options: nosniff", () => {
    const res = makeRes();
    setDefaultSecurityHeaders(res as never);
    expect(res._headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("sets Strict-Transport-Security when configured", () => {
    const res = makeRes();
    setDefaultSecurityHeaders(res as never, {
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
    });
    expect(res._headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
  });
});
