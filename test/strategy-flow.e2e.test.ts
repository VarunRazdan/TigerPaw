import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayClient } from "../src/gateway/client.js";
import { connectGatewayClient } from "../src/gateway/test-helpers.e2e.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../src/utils/message-channel.js";
import {
  type GatewayInstance,
  spawnGatewayInstance,
  stopGatewayInstance,
} from "./helpers/gateway-e2e-harness.js";

const E2E_TIMEOUT_MS = 120_000;

function makeStrategy(overrides?: Record<string, unknown>) {
  return {
    name: "E2E Test Strategy",
    description: "Created by E2E test",
    enabled: true,
    symbols: ["DEMO"],
    extensionId: "ext-test",
    signals: [
      {
        id: "sig-1",
        type: "price_above",
        params: { threshold: 100 },
        weight: 1,
      },
    ],
    entryRule: { minSignalStrength: 0.5, orderType: "market" },
    exitRule: { stopLossPercent: 5, takeProfitPercent: 10 },
    positionSizing: { method: "fixed_usd", fixedUsd: 1000, maxPositionPercent: 10 },
    schedule: "continuous",
    ...overrides,
  };
}

describe("strategy flow e2e", { timeout: E2E_TIMEOUT_MS }, () => {
  let gw: GatewayInstance;
  let client: GatewayClient;
  let savedStrategyId: string;

  beforeAll(async () => {
    gw = await spawnGatewayInstance("strategy-flow");
    client = await connectGatewayClient({
      url: `ws://127.0.0.1:${gw.port}`,
      token: gw.gatewayToken,
      clientName: GATEWAY_CLIENT_NAMES.CLI,
      clientDisplayName: "strategy-e2e",
      clientVersion: "1.0.0",
      platform: "test",
      mode: GATEWAY_CLIENT_MODES.CLI,
    });
  });

  afterAll(async () => {
    client?.stop();
    if (gw) {
      await stopGatewayInstance(gw);
    }
  });

  // ── CRUD ────────────────────────────────────────────────────────

  it("lists strategies when none exist", async () => {
    const res = await client.request<{ strategies: unknown[] }>("strategies.list", {});
    expect(res.strategies).toEqual([]);
  });

  it("saves a strategy and retrieves it", async () => {
    const saveRes = await client.request<{
      strategy: { id: string; name: string; version: number };
    }>("strategies.save", makeStrategy());
    expect(saveRes.strategy.id).toBeTruthy();
    expect(saveRes.strategy.name).toBe("E2E Test Strategy");
    savedStrategyId = saveRes.strategy.id;

    const getRes = await client.request<{
      strategy: { id: string; name: string };
    }>("strategies.get", { id: savedStrategyId });
    expect(getRes.strategy.id).toBe(savedStrategyId);
    expect(getRes.strategy.name).toBe("E2E Test Strategy");
  });

  it("updates strategy by saving with same id", async () => {
    const saveRes = await client.request<{
      strategy: { id: string; name: string; version: number };
    }>("strategies.save", makeStrategy({ id: savedStrategyId, name: "Updated Strategy" }));
    expect(saveRes.strategy.id).toBe(savedStrategyId);
    expect(saveRes.strategy.name).toBe("Updated Strategy");
    expect(saveRes.strategy.version).toBeGreaterThanOrEqual(2);
  });

  it("toggles strategy enabled/disabled", async () => {
    const res = await client.request<{
      strategy: { id: string; enabled: boolean };
    }>("strategies.toggle", { id: savedStrategyId, enabled: false });
    expect(res.strategy.id).toBe(savedStrategyId);
    expect(res.strategy.enabled).toBe(false);
  });

  // ── Validation ──────────────────────────────────────────────────

  it("rejects save with invalid data", async () => {
    await expect(client.request("strategies.save", {})).rejects.toThrow();
  });

  it("rejects delete with missing id", async () => {
    await expect(client.request("strategies.delete", {})).rejects.toThrow();
  });

  // ── Execution History ───────────────────────────────────────────

  it("lists execution history", async () => {
    const res = await client.request<{ executions: unknown[] }>("strategies.executions", {
      strategyId: savedStrategyId,
    });
    expect(Array.isArray(res.executions)).toBe(true);
  });

  it("clears execution history", async () => {
    const res = await client.request<{ removed: number }>("strategies.clearHistory", {
      strategyId: savedStrategyId,
    });
    expect(typeof res.removed).toBe("number");
  });

  // ── Backtest ────────────────────────────────────────────────────

  it("runs backtest with synthetic data provider", async () => {
    await client.request("strategies.toggle", {
      id: savedStrategyId,
      enabled: true,
    });

    const res = await client.request<{
      strategyId: string;
      metrics: Record<string, unknown>;
      tradeCount: number;
    }>("backtest.run", {
      strategyId: savedStrategyId,
      symbol: "DEMO",
      days: 30,
      dataSource: "synthetic",
    });
    expect(res.strategyId).toBe(savedStrategyId);
    expect(res.metrics).toBeDefined();
    expect(typeof res.tradeCount).toBe("number");
  });

  it("backtest.generate creates synthetic data", async () => {
    const res = await client.request<{
      symbol: string;
      bars: number;
      sample: unknown[];
    }>("backtest.generate", {
      symbol: "DEMO",
      days: 30,
      pattern: "random",
      seed: 42,
    });
    expect(res.symbol).toBe("DEMO");
    expect(res.bars).toBeGreaterThan(0);
    expect(res.sample.length).toBeGreaterThan(0);
  });

  // ── Idempotency ─────────────────────────────────────────────────

  it("strategy CRUD is idempotent (save twice does not duplicate)", async () => {
    const payload = makeStrategy({
      id: savedStrategyId,
      name: "Idempotent Check",
    });
    await client.request("strategies.save", payload);
    await client.request("strategies.save", payload);

    const listRes = await client.request<{ strategies: Array<{ id: string }> }>(
      "strategies.list",
      {},
    );
    const matches = listRes.strategies.filter((s) => s.id === savedStrategyId);
    expect(matches.length).toBe(1);
  });

  // ── Delete (last to avoid interfering) ──────────────────────────

  it("deletes strategy by id", async () => {
    const res = await client.request<{ deleted: boolean }>("strategies.delete", {
      id: savedStrategyId,
    });
    expect(res.deleted).toBe(true);

    // Verify it's gone
    await expect(client.request("strategies.get", { id: savedStrategyId })).rejects.toThrow();
  });
});
