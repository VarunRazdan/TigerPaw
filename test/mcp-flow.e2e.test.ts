import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../src/gateway/client.js";
import { ADMIN_SCOPE, READ_SCOPE, WRITE_SCOPE } from "../src/gateway/method-scopes.js";
import {
  type GatewayInstance,
  connectScopedClient,
  spawnGatewayInstance,
  stopGatewayInstance,
} from "./helpers/gateway-e2e-harness.js";

const E2E_TIMEOUT_MS = 120_000;

// MCP gateway methods are not yet registered. These tests verify the default-deny
// behavior for unclassified methods and should be updated when MCP handlers land.
describe("mcp flow e2e", () => {
  let gw: GatewayInstance;
  let adminClient: GatewayClient;
  let readClient: GatewayClient;
  let writeClient: GatewayClient;
  const clients: GatewayClient[] = [];

  beforeAll(async () => {
    gw = await spawnGatewayInstance("mcp-flow");
    adminClient = await connectScopedClient(gw, "mcp-admin", [ADMIN_SCOPE]);
    readClient = await connectScopedClient(gw, "mcp-reader", [READ_SCOPE]);
    writeClient = await connectScopedClient(gw, "mcp-writer", [WRITE_SCOPE]);
    clients.push(adminClient, readClient, writeClient);
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    for (const c of clients) {
      c.stop();
    }
    await stopGatewayInstance(gw);
  });

  // ── MCP method availability ────────────────────────────────

  it(
    "mcp.servers.list returns error for unregistered method",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      await expect(adminClient.request("mcp.servers.list", {})).rejects.toThrow(/unknown method/i);
    },
  );

  it(
    "mcp.tools.list returns error for unregistered method",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      await expect(adminClient.request("mcp.tools.list", {})).rejects.toThrow(/unknown method/i);
    },
  );

  it(
    "mcp.server.test returns error for unregistered method",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      await expect(adminClient.request("mcp.server.test", { serverId: "test" })).rejects.toThrow(
        /unknown method/i,
      );
    },
  );

  it(
    "mcp.server.refreshToken returns error for unregistered method",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      await expect(
        adminClient.request("mcp.server.refreshToken", { serverId: "test" }),
      ).rejects.toThrow(/unknown method/i);
    },
  );

  // ── Scope enforcement for unclassified methods ─────────────

  it("read-scoped client is denied unclassified methods", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(readClient.request("mcp.servers.list", {})).rejects.toThrow(/missing scope/i);
  });

  it(
    "write-scoped client is denied unclassified methods",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      await expect(writeClient.request("mcp.servers.list", {})).rejects.toThrow(/missing scope/i);
    },
  );

  it(
    "admin-scoped client reaches the handler layer for unclassified methods",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      try {
        await adminClient.request("mcp.servers.list", {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).not.toMatch(/missing scope/i);
        expect(msg).toMatch(/unknown method/i);
      }
    },
  );

  it("unscoped client is denied MCP methods", { timeout: E2E_TIMEOUT_MS }, async () => {
    const unscopedClient = await connectScopedClient(gw, "mcp-unscoped", []);
    clients.push(unscopedClient);
    await expect(unscopedClient.request("mcp.servers.list", {})).rejects.toThrow(/missing scope/i);
  });

  // ── General gateway method dispatch ────────────────────────

  it("known read methods work with admin scope", { timeout: E2E_TIMEOUT_MS }, async () => {
    const res = await adminClient.request("health", {});
    expect(res).toBeDefined();
  });

  it(
    "tools.catalog returns available tools with admin scope",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      const res = await adminClient.request<{ tools?: unknown[] }>("tools.catalog", {});
      expect(res).toBeDefined();
    },
  );
});
