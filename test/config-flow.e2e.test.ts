import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatewayClient } from "../src/gateway/client.js";
import { ADMIN_SCOPE, READ_SCOPE } from "../src/gateway/method-scopes.js";
import {
  type GatewayInstance,
  connectScopedClient,
  spawnGatewayInstance,
  stopGatewayInstance,
} from "./helpers/gateway-e2e-harness.js";

const E2E_TIMEOUT_MS = 120_000;

describe("config flow e2e", () => {
  let gw: GatewayInstance;
  let adminClient: GatewayClient;
  let readClient: GatewayClient;
  const clients: GatewayClient[] = [];

  beforeAll(async () => {
    gw = await spawnGatewayInstance("config-flow");
    adminClient = await connectScopedClient(gw, "config-admin", [ADMIN_SCOPE]);
    readClient = await connectScopedClient(gw, "config-reader", [READ_SCOPE]);
    clients.push(adminClient, readClient);
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    for (const c of clients) {
      c.stop();
    }
    await stopGatewayInstance(gw);
  });

  it("reads config via config.get", { timeout: E2E_TIMEOUT_MS }, async () => {
    const res = await adminClient.request<{ exists?: boolean }>("config.get", {});
    expect(res).toBeDefined();
    expect(typeof res.exists).toBe("boolean");
  });

  it("config.get returns expected structure", { timeout: E2E_TIMEOUT_MS }, async () => {
    const res = await adminClient.request<{
      exists?: boolean;
      raw?: string;
      hash?: string;
      config?: Record<string, unknown>;
    }>("config.get", {});
    expect(res).toBeDefined();
    expect("exists" in res).toBe(true);
    if (res.exists) {
      expect(typeof res.raw).toBe("string");
      expect(typeof res.hash).toBe("string");
    }
  });

  it("config.patch applies changes", { timeout: E2E_TIMEOUT_MS }, async () => {
    const snapshot = await adminClient.request<{
      hash?: string;
      config?: Record<string, unknown>;
    }>("config.get", {});

    const baseHash = snapshot.hash;
    expect(typeof baseHash).toBe("string");

    const res = await adminClient.request<{
      ok?: boolean;
      config?: Record<string, unknown>;
    }>("config.patch", {
      raw: '{ "hooks": { "enabled": true } }',
      baseHash,
    });
    expect(res.ok).toBe(true);
  });

  it("reads back changed config after patch", { timeout: E2E_TIMEOUT_MS }, async () => {
    const res = await adminClient.request<{
      exists?: boolean;
      config?: { hooks?: { enabled?: boolean } };
    }>("config.get", {});
    expect(res.exists).toBe(true);
    expect(res.config?.hooks?.enabled).toBe(true);
  });

  it("rejects config.patch with invalid raw param", { timeout: E2E_TIMEOUT_MS }, async () => {
    const snapshot = await adminClient.request<{ hash?: string }>("config.get", {});
    await expect(
      adminClient.request("config.patch", {
        raw: 12345, // not a string
        baseHash: snapshot.hash,
      }),
    ).rejects.toThrow();
  });

  it(
    "rejects config.set without baseHash when config exists",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      await expect(
        adminClient.request("config.set", {
          raw: "{}",
          // no baseHash
        }),
      ).rejects.toThrow(/base hash/i);
    },
  );

  it("read-scoped client can call config.get", { timeout: E2E_TIMEOUT_MS }, async () => {
    const res = await readClient.request<{ exists?: boolean }>("config.get", {});
    expect(res).toBeDefined();
    expect(typeof res.exists).toBe("boolean");
  });

  it("config operations require admin scope", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(readClient.request("config.set", { raw: "{}" })).rejects.toThrow(/missing scope/i);

    await expect(readClient.request("config.patch", { raw: "{}" })).rejects.toThrow(
      /missing scope/i,
    );

    await expect(readClient.request("config.apply", { raw: "{}" })).rejects.toThrow(
      /missing scope/i,
    );
  });
});
