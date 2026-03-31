import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GatewayClient } from "../src/gateway/client.js";
import { connectGatewayClient } from "../src/gateway/test-helpers.e2e.js";
import {
  type GatewayInstance,
  spawnGatewayInstance,
  stopGatewayInstance,
} from "./helpers/gateway-e2e-harness.js";

const E2E_TIMEOUT_MS = 120_000;

type TradingState = {
  dailyPnlUsd: number;
  dailySpendUsd: number;
  dailyTradeCount: number;
  consecutiveLosses: number;
  killSwitch: {
    active: boolean;
    mode?: string;
    activatedAt?: number;
    activatedBy?: string;
    reason?: string;
  };
  platformKillSwitches: Record<
    string,
    {
      active: boolean;
      activatedAt?: number;
      activatedBy?: string;
      reason?: string;
    }
  >;
};

type KillSwitchResult = {
  active: boolean;
  mode?: string;
};

type PlatformKillSwitchResult = {
  extensionId: string;
  active: boolean;
};

describe("kill switch e2e", () => {
  let gateway: GatewayInstance;
  let client: GatewayClient;

  beforeAll(async () => {
    gateway = await spawnGatewayInstance("kill-switch");
    client = await connectGatewayClient({
      url: `ws://127.0.0.1:${gateway.port}`,
      token: gateway.gatewayToken,
    });
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    client?.stop();
    if (gateway) {
      await stopGatewayInstance(gateway);
    }
  });

  it("initial state has kill switch inactive", { timeout: E2E_TIMEOUT_MS }, async () => {
    const state = await client.request<TradingState>("trading.getState", {});
    expect(state.killSwitch.active).toBe(false);
  });

  it(
    "activates global kill switch with hard mode and reason",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      const result = await client.request<KillSwitchResult>("trading.killSwitch.toggle", {
        active: true,
        mode: "hard",
        reason: "E2E test activation",
      });
      expect(result.active).toBe(true);
      expect(result.mode).toBe("hard");

      // Verify state reflects activation
      const state = await client.request<TradingState>("trading.getState", {});
      expect(state.killSwitch.active).toBe(true);
    },
  );

  it("deactivates global kill switch", { timeout: E2E_TIMEOUT_MS }, async () => {
    // Ensure active first
    await client.request<KillSwitchResult>("trading.killSwitch.toggle", {
      active: true,
      reason: "pre-deactivation setup",
    });

    const result = await client.request<KillSwitchResult>("trading.killSwitch.toggle", {
      active: false,
    });
    expect(result.active).toBe(false);

    const state = await client.request<TradingState>("trading.getState", {});
    expect(state.killSwitch.active).toBe(false);
  });

  it("soft mode selection", { timeout: E2E_TIMEOUT_MS }, async () => {
    const result = await client.request<KillSwitchResult>("trading.killSwitch.toggle", {
      active: true,
      mode: "soft",
      reason: "E2E soft mode test",
    });
    expect(result.active).toBe(true);
    expect(result.mode).toBe("soft");

    // Clean up
    await client.request<KillSwitchResult>("trading.killSwitch.toggle", { active: false });
  });

  it("activates platform-specific kill switch", { timeout: E2E_TIMEOUT_MS }, async () => {
    const result = await client.request<PlatformKillSwitchResult>("trading.killSwitch.platform", {
      extensionId: "alpaca",
      active: true,
      reason: "E2E platform kill test",
    });
    expect(result.extensionId).toBe("alpaca");
    expect(result.active).toBe(true);

    const state = await client.request<TradingState>("trading.getState", {});
    expect(state.platformKillSwitches.alpaca?.active).toBe(true);
  });

  it("deactivates platform-specific kill switch", { timeout: E2E_TIMEOUT_MS }, async () => {
    // Ensure active first
    await client.request<PlatformKillSwitchResult>("trading.killSwitch.platform", {
      extensionId: "alpaca",
      active: true,
      reason: "pre-deactivation setup",
    });

    const result = await client.request<PlatformKillSwitchResult>("trading.killSwitch.platform", {
      extensionId: "alpaca",
      active: false,
    });
    expect(result.extensionId).toBe("alpaca");
    expect(result.active).toBe(false);
  });

  it("rejects platform kill switch without extensionId", { timeout: E2E_TIMEOUT_MS }, async () => {
    await expect(
      client.request("trading.killSwitch.platform", {
        active: true,
        reason: "should fail",
      }),
    ).rejects.toThrow();
  });

  it("kill switch state persists across getState calls", { timeout: E2E_TIMEOUT_MS }, async () => {
    await client.request<KillSwitchResult>("trading.killSwitch.toggle", {
      active: true,
      reason: "persistence check",
    });

    const state1 = await client.request<TradingState>("trading.getState", {});
    const state2 = await client.request<TradingState>("trading.getState", {});
    expect(state1.killSwitch.active).toBe(true);
    expect(state2.killSwitch.active).toBe(true);

    // Clean up
    await client.request<KillSwitchResult>("trading.killSwitch.toggle", { active: false });
  });

  it("multiple platform kill switches are independent", { timeout: E2E_TIMEOUT_MS }, async () => {
    // Activate two different platforms
    await client.request<PlatformKillSwitchResult>("trading.killSwitch.platform", {
      extensionId: "alpaca",
      active: true,
      reason: "alpaca halt",
    });
    await client.request<PlatformKillSwitchResult>("trading.killSwitch.platform", {
      extensionId: "binance",
      active: true,
      reason: "binance halt",
    });

    // Deactivate only alpaca
    await client.request<PlatformKillSwitchResult>("trading.killSwitch.platform", {
      extensionId: "alpaca",
      active: false,
    });

    const state = await client.request<TradingState>("trading.getState", {});
    expect(state.platformKillSwitches.alpaca?.active).toBe(false);
    expect(state.platformKillSwitches.binance?.active).toBe(true);

    // Clean up
    await client.request<PlatformKillSwitchResult>("trading.killSwitch.platform", {
      extensionId: "binance",
      active: false,
    });
  });

  it("kill switch can be toggled rapidly without error", { timeout: E2E_TIMEOUT_MS }, async () => {
    // Rapidly toggle 5 times
    for (let i = 0; i < 5; i++) {
      await client.request<KillSwitchResult>("trading.killSwitch.toggle", {
        active: true,
        reason: `rapid toggle ${i}`,
      });
      await client.request<KillSwitchResult>("trading.killSwitch.toggle", {
        active: false,
      });
    }

    // Final state should be inactive after the last deactivation
    const state = await client.request<TradingState>("trading.getState", {});
    expect(state.killSwitch.active).toBe(false);
  });
});
