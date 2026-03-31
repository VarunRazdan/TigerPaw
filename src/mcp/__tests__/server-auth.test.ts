import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMcpSession } from "../server.js";
import type { JsonRpcRequest } from "../types.js";

// Mock the tools module so we don't need real trading state
vi.mock("../tools.js", () => ({
  MCP_TOOLS: [
    { name: "get_trading_state", description: "Get state", inputSchema: { type: "object", properties: {} } },
    { name: "get_positions", description: "Get positions", inputSchema: { type: "object", properties: {} } },
    { name: "place_order", description: "Place order", inputSchema: { type: "object", properties: {} } },
    { name: "toggle_kill_switch", description: "Toggle kill switch", inputSchema: { type: "object", properties: {} } },
  ],
  executeTool: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "{}" }],
    isError: false,
  }),
}));

function req(method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params };
}

describe("MCP server auth flow", () => {
  describe("when token is configured", () => {
    const authConfig = { token: "my-secret-token" };

    it("rejects tools/list before initialize", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(req("tools/list"));
      expect(res.error?.code).toBe(-32600);
      expect(res.error?.message).toContain("Authentication required");
    });

    it("rejects tools/call before initialize", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(
        req("tools/call", { name: "get_trading_state" }),
      );
      expect(res.error?.code).toBe(-32600);
    });

    it("allows ping before initialize", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(req("ping"));
      expect(res.error).toBeUndefined();
      expect(res.result).toEqual({});
    });

    it("allows initialize", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(
        req("initialize", {
          protocolVersion: "2024-11-05",
          _meta: { auth: { token: "my-secret-token" } },
        }),
      );
      expect(res.error).toBeUndefined();
      expect(res.result).toHaveProperty("serverInfo");
    });

    it("rejects initialize with wrong token", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(
        req("initialize", {
          protocolVersion: "2024-11-05",
          _meta: { auth: { token: "wrong" } },
        }),
      );
      expect(res.error?.code).toBe(-32600);
      expect(res.error?.message).toContain("Invalid authentication token");
    });

    it("rejects all requests after failed initialize", async () => {
      const session = createMcpSession(authConfig);
      await session.handleRequest(
        req("initialize", { _meta: { auth: { token: "wrong" } } }),
      );
      expect(session.getAuthState()).toBe("rejected");

      const res = await session.handleRequest(req("ping"));
      expect(res.error?.code).toBe(-32600);
      expect(res.error?.message).toContain("Authentication failed");
    });

    it("accepts tools/list after successful initialize", async () => {
      const session = createMcpSession(authConfig);
      await session.handleRequest(
        req("initialize", { _meta: { auth: { token: "my-secret-token" } } }),
      );
      const res = await session.handleRequest(req("tools/list"));
      expect(res.error).toBeUndefined();
      expect(res.result).toHaveProperty("tools");
    });

    it("accepts tools/call after successful initialize", async () => {
      const session = createMcpSession(authConfig);
      await session.handleRequest(
        req("initialize", { _meta: { auth: { token: "my-secret-token" } } }),
      );
      const res = await session.handleRequest(
        req("tools/call", { name: "get_trading_state", arguments: {} }),
      );
      expect(res.error).toBeUndefined();
    });

    it("rejects initialize without token when token is required", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(
        req("initialize", { protocolVersion: "2024-11-05" }),
      );
      expect(res.error?.code).toBe(-32600);
    });
  });

  describe("when no token is configured (backward compatible)", () => {
    const authConfig = {};

    it("allows initialize without token", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(req("initialize"));
      expect(res.error).toBeUndefined();
      expect(res.result).toHaveProperty("serverInfo");
    });

    it("allows tools/list without prior initialize", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(req("tools/list"));
      expect(res.error).toBeUndefined();
      expect(res.result).toHaveProperty("tools");
    });

    it("allows tools/call without prior initialize", async () => {
      const session = createMcpSession(authConfig);
      const res = await session.handleRequest(
        req("tools/call", { name: "get_trading_state", arguments: {} }),
      );
      expect(res.error).toBeUndefined();
    });
  });

  describe("scope filtering", () => {
    it("filters tools/list to only read tools when scope is read", async () => {
      const session = createMcpSession({ scopes: ["read"] });
      const res = await session.handleRequest(req("tools/list"));
      const tools = (res.result as { tools: { name: string }[] }).tools;
      const names = tools.map((t) => t.name);
      expect(names).toContain("get_trading_state");
      expect(names).toContain("get_positions");
      expect(names).not.toContain("place_order");
      expect(names).not.toContain("toggle_kill_switch");
    });

    it("includes trade tools when scope includes trade", async () => {
      const session = createMcpSession({ scopes: ["read", "trade"] });
      const res = await session.handleRequest(req("tools/list"));
      const tools = (res.result as { tools: { name: string }[] }).tools;
      const names = tools.map((t) => t.name);
      expect(names).toContain("place_order");
      expect(names).not.toContain("toggle_kill_switch");
    });

    it("includes all tools when scope includes admin", async () => {
      const session = createMcpSession({ scopes: ["admin"] });
      const res = await session.handleRequest(req("tools/list"));
      const tools = (res.result as { tools: { name: string }[] }).tools;
      expect(tools.length).toBe(4);
    });

    it("rejects tools/call for out-of-scope tool", async () => {
      const session = createMcpSession({ scopes: ["read"] });
      const res = await session.handleRequest(
        req("tools/call", { name: "place_order", arguments: {} }),
      );
      const result = res.result as { content: { text: string }[]; isError: boolean };
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Insufficient scope");
    });

    it("allows tools/call for in-scope tool", async () => {
      const session = createMcpSession({ scopes: ["read"] });
      const res = await session.handleRequest(
        req("tools/call", { name: "get_trading_state", arguments: {} }),
      );
      expect(res.error).toBeUndefined();
    });
  });
});
