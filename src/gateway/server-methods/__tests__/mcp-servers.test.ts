/**
 * Tests for the MCP servers gateway RPC handlers.
 *
 * Mocks loadConfig to validate listing, tool enumeration,
 * connection testing, and token generation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayRequestHandlerOptions } from "../types.js";

// ── Hoisted mocks ────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  randomBytes: vi.fn(),
}));

vi.mock("../../../config/config.js", () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock("node:crypto", () => ({
  randomBytes: mocks.randomBytes,
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeOpts(
  method: string,
  params: Record<string, unknown>,
): { opts: GatewayRequestHandlerOptions; respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  return {
    opts: {
      req: { type: "req" as const, method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
    respond,
  };
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadConfig.mockReturnValue({});
});

// ── Import handlers (after mocks are registered) ─────────────────

const { mcpServersHandlers } = await import("../mcp-servers.js");

// ── mcp.servers.list ─────────────────────────────────────────────

describe("mcp.servers.list", () => {
  const handler = mcpServersHandlers["mcp.servers.list"];

  it("returns empty array when no mcpServers configured", async () => {
    mocks.loadConfig.mockReturnValue({});
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { servers: [] }, undefined);
  });

  it("returns empty array when mcpServers is empty object", async () => {
    mocks.loadConfig.mockReturnValue({ mcpServers: {} });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { servers: [] }, undefined);
  });

  it("detects SSE transport when url is present", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        remote: { name: "Remote Server", url: "http://mcp.example.com/sse", tools: [] },
      },
    });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      servers: Array<{ transport: string; url: string }>;
    };
    expect(payload.servers).toHaveLength(1);
    expect(payload.servers[0].transport).toBe("sse");
    expect(payload.servers[0].url).toBe("http://mcp.example.com/sse");
  });

  it("detects stdio transport when command is present", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        local: { name: "Local Server", command: "npx mcp-server", tools: [] },
      },
    });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      servers: Array<{ transport: string; command: string }>;
    };
    expect(payload.servers).toHaveLength(1);
    expect(payload.servers[0].transport).toBe("stdio");
    expect(payload.servers[0].command).toBe("npx mcp-server");
  });

  it("marks disabled server as disconnected", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        off: { disabled: true, command: "node server.js", tools: [] },
      },
    });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      servers: Array<{ status: string }>;
    };
    expect(payload.servers[0].status).toBe("disconnected");
  });

  it("marks enabled server as connected", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        on: { command: "node server.js", tools: [] },
      },
    });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      servers: Array<{ status: string }>;
    };
    expect(payload.servers[0].status).toBe("connected");
  });

  it("reports tool count and tool names", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        srv: { command: "node s.js", tools: ["read_file", "write_file", "search"] },
      },
    });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      servers: Array<{ toolCount: number; tools: string[] }>;
    };
    expect(payload.servers[0].toolCount).toBe(3);
    expect(payload.servers[0].tools).toEqual(["read_file", "write_file", "search"]);
  });

  it("uses id as fallback name", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        "my-server": { command: "node s.js", tools: [] },
      },
    });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      servers: Array<{ id: string; name: string }>;
    };
    expect(payload.servers[0].id).toBe("my-server");
    expect(payload.servers[0].name).toBe("my-server");
  });

  it("returns error on config load failure", async () => {
    mocks.loadConfig.mockImplementation(() => {
      throw new Error("corrupt config");
    });
    const { opts, respond } = makeOpts("mcp.servers.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── mcp.tools.list ───────────────────────────────────────────────

describe("mcp.tools.list", () => {
  const handler = mcpServersHandlers["mcp.tools.list"];

  it("returns empty when no mcpServers configured", async () => {
    mocks.loadConfig.mockReturnValue({});
    const { opts, respond } = makeOpts("mcp.tools.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { tools: [] }, undefined);
  });

  it("returns tools for a specific server", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        s1: { tools: ["read_file", "write_file"] },
        s2: { tools: ["search"] },
      },
    });
    const { opts, respond } = makeOpts("mcp.tools.list", { serverId: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { tools: ["read_file", "write_file"] }, undefined);
  });

  it("returns error when specific server not found", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: { s1: { tools: [] } },
    });
    const { opts, respond } = makeOpts("mcp.tools.list", { serverId: "missing" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "server not found" }),
    );
  });

  it("returns all tools across servers when no serverId", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: {
        s1: { tools: ["read_file"] },
        s2: { tools: ["search", "index"] },
      },
    });
    const { opts, respond } = makeOpts("mcp.tools.list", {});
    await handler(opts);

    const payload = (respond.mock.calls[0] as unknown[])[1] as {
      tools: Array<{ server: string; name: string }>;
    };
    expect(payload.tools).toHaveLength(3);
    expect(payload.tools).toContainEqual({ server: "s1", name: "read_file" });
    expect(payload.tools).toContainEqual({ server: "s2", name: "search" });
    expect(payload.tools).toContainEqual({ server: "s2", name: "index" });
  });

  it("handles servers with no tools array", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: { s1: { command: "node s.js" } },
    });
    const { opts, respond } = makeOpts("mcp.tools.list", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(true, { tools: [] }, undefined);
  });
});

// ── mcp.server.test ──────────────────────────────────────────────

describe("mcp.server.test", () => {
  const handler = mcpServersHandlers["mcp.server.test"];

  it("rejects missing serverId", async () => {
    const { opts, respond } = makeOpts("mcp.server.test", {});
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "serverId is required" }),
    );
  });

  it("rejects when server not found", async () => {
    mocks.loadConfig.mockReturnValue({ mcpServers: {} });
    const { opts, respond } = makeOpts("mcp.server.test", { serverId: "ghost" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "server not found" }),
    );
  });

  it("reports reachable for enabled server with endpoint", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: { s1: { url: "http://mcp.local/sse" } },
    });
    const { opts, respond } = makeOpts("mcp.server.test", { serverId: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      true,
      { serverId: "s1", reachable: true, transport: "sse" },
      undefined,
    );
  });

  it("reports not reachable for disabled server", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: { s1: { url: "http://mcp.local/sse", disabled: true } },
    });
    const { opts, respond } = makeOpts("mcp.server.test", { serverId: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      true,
      { serverId: "s1", reachable: false, transport: "sse" },
      undefined,
    );
  });

  it("reports stdio transport for command-based server", async () => {
    mocks.loadConfig.mockReturnValue({
      mcpServers: { s1: { command: "node mcp.js" } },
    });
    const { opts, respond } = makeOpts("mcp.server.test", { serverId: "s1" });
    await handler(opts);
    expect(respond).toHaveBeenCalledWith(
      true,
      { serverId: "s1", reachable: true, transport: "stdio" },
      undefined,
    );
  });
});

// ── mcp.server.refreshToken ──────────────────────────────────────

describe("mcp.server.refreshToken", () => {
  const handler = mcpServersHandlers["mcp.server.refreshToken"];

  it("returns a 64-char hex token", async () => {
    const fakeBytes = Buffer.from("a".repeat(32));
    mocks.randomBytes.mockReturnValue(fakeBytes);

    const { opts, respond } = makeOpts("mcp.server.refreshToken", {});
    await handler(opts);

    expect(mocks.randomBytes).toHaveBeenCalledWith(32);
    expect(respond).toHaveBeenCalledWith(true, { token: fakeBytes.toString("hex") }, undefined);
  });

  it("returns error on crypto failure", async () => {
    mocks.randomBytes.mockImplementation(() => {
      throw new Error("entropy depleted");
    });

    const { opts, respond } = makeOpts("mcp.server.refreshToken", {});
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});
