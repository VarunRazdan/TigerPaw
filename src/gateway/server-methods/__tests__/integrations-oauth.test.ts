import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOAuth2CallbackRequest } from "../../server-http-oauth-callback.js";

// Mock IntegrationService
vi.mock("../../../integrations/index.js", () => {
  const completeOAuth = vi.fn();
  return {
    getIntegrationService: () => ({
      completeOAuth,
    }),
    __mockCompleteOAuth: completeOAuth,
  };
});

function createMockReq(url: string, method = "GET"): IncomingMessage {
  return { url, method, headers: {} } as unknown as IncomingMessage;
}

function createMockRes(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: "",
    get statusCode() {
      return this._statusCode;
    },
    set statusCode(code: number) {
      this._statusCode = code;
    },
    setHeader(name: string, value: string) {
      this._headers[name.toLowerCase()] = value;
    },
    end(body?: string) {
      this._body = body ?? "";
    },
  };
  return res as unknown as ReturnType<typeof createMockRes>;
}

describe("OAuth2 Callback Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for non-callback paths", async () => {
    const req = createMockReq("/other/path");
    const res = createMockRes();
    const handled = await handleOAuth2CallbackRequest(req, res);
    expect(handled).toBe(false);
  });

  it("returns 405 for POST requests", async () => {
    const req = createMockReq("/integrations/oauth2/callback?code=abc&state=xyz", "POST");
    const res = createMockRes();
    const handled = await handleOAuth2CallbackRequest(req, res);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(405);
  });

  it("shows error page when provider returns error param", async () => {
    const req = createMockReq(
      "/integrations/oauth2/callback?error=access_denied&error_description=User+denied",
    );
    const res = createMockRes();
    const handled = await handleOAuth2CallbackRequest(req, res);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    expect(res._body).toContain("Connection Failed");
    expect(res._body).toContain("User denied");
  });

  it("shows error page when code or state is missing", async () => {
    const req = createMockReq("/integrations/oauth2/callback?code=abc");
    const res = createMockRes();
    const handled = await handleOAuth2CallbackRequest(req, res);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain("Missing code or state");
  });

  it("shows success page on successful OAuth completion", async () => {
    const { __mockCompleteOAuth } = (await import("../../../integrations/index.js")) as unknown as {
      __mockCompleteOAuth: ReturnType<typeof vi.fn>;
    };
    __mockCompleteOAuth.mockResolvedValue({
      id: "gmail-abc",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "Gmail",
      accountEmail: "test@gmail.com",
      connectedAt: new Date().toISOString(),
    });

    const req = createMockReq("/integrations/oauth2/callback?code=authcode123&state=validstate");
    const res = createMockRes();
    const handled = await handleOAuth2CallbackRequest(req, res);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    expect(res._body).toContain("Gmail Connected");
    expect(res._body).toContain("test@gmail.com");
    expect(__mockCompleteOAuth).toHaveBeenCalledWith("validstate", "authcode123");
  });

  it("shows error page when completeOAuth returns error", async () => {
    const { __mockCompleteOAuth } = (await import("../../../integrations/index.js")) as unknown as {
      __mockCompleteOAuth: ReturnType<typeof vi.fn>;
    };
    __mockCompleteOAuth.mockResolvedValue({ error: "Invalid or expired OAuth state" });

    const req = createMockReq("/integrations/oauth2/callback?code=abc&state=expired");
    const res = createMockRes();
    const handled = await handleOAuth2CallbackRequest(req, res);
    expect(handled).toBe(true);
    expect(res._body).toContain("Connection Failed");
    expect(res._body).toContain("Invalid or expired OAuth state");
  });

  it("shows error page when completeOAuth throws", async () => {
    const { __mockCompleteOAuth } = (await import("../../../integrations/index.js")) as unknown as {
      __mockCompleteOAuth: ReturnType<typeof vi.fn>;
    };
    __mockCompleteOAuth.mockRejectedValue(new Error("Network timeout"));

    const req = createMockReq("/integrations/oauth2/callback?code=abc&state=xyz");
    const res = createMockRes();
    const handled = await handleOAuth2CallbackRequest(req, res);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(500);
    expect(res._body).toContain("Network timeout");
  });

  it("escapes HTML in provider label and email", async () => {
    const { __mockCompleteOAuth } = (await import("../../../integrations/index.js")) as unknown as {
      __mockCompleteOAuth: ReturnType<typeof vi.fn>;
    };
    __mockCompleteOAuth.mockResolvedValue({
      id: "test-1",
      providerId: "gmail",
      category: "email",
      status: "connected",
      label: "<script>alert(1)</script>",
      accountEmail: "user@example.com",
      connectedAt: new Date().toISOString(),
    });

    const req = createMockReq("/integrations/oauth2/callback?code=abc&state=xyz");
    const res = createMockRes();
    await handleOAuth2CallbackRequest(req, res);
    expect(res._body).not.toContain("<script>");
    expect(res._body).toContain("&lt;script&gt;");
  });
});
