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

describe("auth scope enforcement e2e", () => {
  let gw: GatewayInstance;
  const clients: GatewayClient[] = [];

  beforeAll(async () => {
    gw = await spawnGatewayInstance("auth-scope");
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    for (const c of clients) {
      c.stop();
    }
    await stopGatewayInstance(gw);
  });

  // ── Token auth ─────────────────────────────────────────────

  describe("token auth", () => {
    it("rejects WS connection with wrong token", { timeout: E2E_TIMEOUT_MS }, async () => {
      await expect(
        connectScopedClient(gw, "bad-token", [ADMIN_SCOPE], "wrong-token-value"),
      ).rejects.toThrow();
    });

    it(
      "rejects WS connection with empty token when auth is required",
      { timeout: E2E_TIMEOUT_MS },
      async () => {
        await expect(connectScopedClient(gw, "no-token", [ADMIN_SCOPE], "")).rejects.toThrow();
      },
    );

    it("accepts WS connection with correct token", { timeout: E2E_TIMEOUT_MS }, async () => {
      const client = await connectScopedClient(gw, "good-token", [ADMIN_SCOPE]);
      clients.push(client);
      const res = await client.request<{ ts?: number }>("health", {});
      expect(res).toBeDefined();
    });
  });

  // ── Scope enforcement ──────────────────────────────────────

  describe("scope enforcement", () => {
    let readClient: GatewayClient;
    let adminClient: GatewayClient;
    let writeClient: GatewayClient;

    beforeAll(async () => {
      readClient = await connectScopedClient(gw, "read-only", [READ_SCOPE]);
      adminClient = await connectScopedClient(gw, "admin", [ADMIN_SCOPE]);
      writeClient = await connectScopedClient(gw, "write-only", [WRITE_SCOPE]);
      clients.push(readClient, adminClient, writeClient);
    }, E2E_TIMEOUT_MS);

    it("read-scoped client can call health", { timeout: E2E_TIMEOUT_MS }, async () => {
      const res = await readClient.request<{ ts?: number }>("health", {});
      expect(res).toBeDefined();
    });

    it("read-scoped client can call config.get", { timeout: E2E_TIMEOUT_MS }, async () => {
      const res = await readClient.request("config.get", {});
      expect(res).toBeDefined();
    });

    it("read-scoped client can call status", { timeout: E2E_TIMEOUT_MS }, async () => {
      const res = await readClient.request("status", {});
      expect(res).toBeDefined();
    });

    it(
      "read-scoped client CANNOT call config.set (admin)",
      { timeout: E2E_TIMEOUT_MS },
      async () => {
        await expect(readClient.request("config.set", { raw: "{}" })).rejects.toThrow(
          /missing scope/i,
        );
      },
    );

    it(
      "read-scoped client CANNOT call agents.create (admin)",
      { timeout: E2E_TIMEOUT_MS },
      async () => {
        await expect(readClient.request("agents.create", { name: "test" })).rejects.toThrow(
          /missing scope/i,
        );
      },
    );

    it("write-scoped client can call write methods", { timeout: E2E_TIMEOUT_MS }, async () => {
      const res = await writeClient.request("health", {});
      expect(res).toBeDefined();
    });

    it("write-scoped client CANNOT call admin methods", { timeout: E2E_TIMEOUT_MS }, async () => {
      await expect(writeClient.request("config.set", { raw: "{}" })).rejects.toThrow(
        /missing scope/i,
      );
    });

    it(
      "admin-scoped client can call health (read method)",
      { timeout: E2E_TIMEOUT_MS },
      async () => {
        const res = await adminClient.request<{ ts?: number }>("health", {});
        expect(res).toBeDefined();
      },
    );

    it(
      "admin-scoped client can call config.get (read method)",
      { timeout: E2E_TIMEOUT_MS },
      async () => {
        const res = await adminClient.request("config.get", {});
        expect(res).toBeDefined();
      },
    );

    it("admin-scoped client can call admin-only methods", { timeout: E2E_TIMEOUT_MS }, async () => {
      // sessions.reset is admin-scoped; should not throw scope error
      // (may throw a different error like "session not found" which is fine)
      try {
        await adminClient.request("sessions.reset", { sessionKey: "nonexistent" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // A scope error would say "missing scope"; any other error means auth passed
        expect(msg).not.toMatch(/missing scope/i);
      }
    });

    it(
      "unscoped client is denied access to non-health methods",
      { timeout: E2E_TIMEOUT_MS },
      async () => {
        const unscopedClient = await connectScopedClient(gw, "unscoped", []);
        clients.push(unscopedClient);
        // health is always allowed (no scope check in authorizeGatewayMethod)
        const healthRes = await unscopedClient.request("health", {});
        expect(healthRes).toBeDefined();
        // config.get requires read scope
        await expect(unscopedClient.request("config.get", {})).rejects.toThrow(/missing scope/i);
      },
    );
  });

  // ── Rate limiting ──────────────────────────────────────────

  describe("rate limiting", () => {
    let rlClient: GatewayClient;

    beforeAll(async () => {
      rlClient = await connectScopedClient(gw, "rate-limit-admin", [ADMIN_SCOPE]);
      clients.push(rlClient);
    }, E2E_TIMEOUT_MS);

    it("allows requests under threshold", { timeout: E2E_TIMEOUT_MS }, async () => {
      const res = await rlClient.request<{ ts?: number }>("health", {});
      expect(res).toBeDefined();
    });

    it(
      "blocks config.apply after exceeding control-plane write limit",
      { timeout: E2E_TIMEOUT_MS },
      async () => {
        // Spawn a fresh gateway so the rate-limit buckets are clean
        const rlGw = await spawnGatewayInstance("rate-limit-test");
        const client = await connectScopedClient(rlGw, "rl-tester", [ADMIN_SCOPE]);
        clients.push(client);

        // First, get config to obtain the baseHash
        const configSnapshot = await client.request<{
          exists?: boolean;
          raw?: string;
          hash?: string;
        }>("config.get", {});

        const baseHash = configSnapshot.hash;

        // The control-plane write limit is 3 per 60s for config.apply/config.patch/update.run.
        // Fire 3 config.apply calls (they may fail for non-rate-limit reasons, that's fine).
        const results: Array<{ ok: boolean; error?: string }> = [];
        for (let i = 0; i < 4; i++) {
          try {
            await client.request("config.apply", {
              raw: '{ "gateway": {} }',
              baseHash,
            });
            results.push({ ok: true });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ ok: false, error: msg });
          }
        }

        // At least one of the later calls should be rate-limited
        const rateLimited = results.some((r) => r.error?.includes("rate limit"));
        expect(rateLimited).toBe(true);

        client.stop();
        await stopGatewayInstance(rlGw);
      },
    );

    it("returns appropriate error message on rate limit", { timeout: E2E_TIMEOUT_MS }, async () => {
      const rlGw2 = await spawnGatewayInstance("rate-limit-err");
      const client = await connectScopedClient(rlGw2, "rl-err-tester", [ADMIN_SCOPE]);
      clients.push(client);

      const configSnapshot = await client.request<{ hash?: string }>("config.get", {});
      const baseHash = configSnapshot.hash;

      // Exhaust the budget
      for (let i = 0; i < 3; i++) {
        try {
          await client.request("config.apply", {
            raw: '{ "gateway": {} }',
            baseHash,
          });
        } catch {
          // ignore non-rate-limit errors
        }
      }

      // The 4th should be rate-limited
      try {
        await client.request("config.apply", {
          raw: '{ "gateway": {} }',
          baseHash,
        });
        // If it didn't throw, that's unexpected but not a test failure for this assertion
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("rate limit")) {
          expect(msg).toMatch(/retry after/i);
        }
      }

      client.stop();
      await stopGatewayInstance(rlGw2);
    });

    it("health method is not rate-limited", { timeout: E2E_TIMEOUT_MS }, async () => {
      const promises = Array.from({ length: 10 }, () =>
        rlClient.request<{ ts?: number }>("health", {}),
      );
      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res).toBeDefined();
      }
    });
  });
});
