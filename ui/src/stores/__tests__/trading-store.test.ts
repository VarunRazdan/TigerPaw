import { describe, it, expect, beforeEach } from "vitest";
import { useTradingStore } from "../trading-store";

const EXPECTED_PLATFORMS = [
  "alpaca",
  "polymarket",
  "kalshi",
  "manifold",
  "coinbase",
  "ibkr",
  "binance",
  "kraken",
  "dydx",
] as const;

// Capture the initial state once so we can reset between tests.
const initialState = useTradingStore.getState();

describe("trading-store", () => {
  beforeEach(() => {
    useTradingStore.setState(initialState, true);
  });

  it("initial state has all 9 platforms", () => {
    const { platforms } = useTradingStore.getState();
    const keys = Object.keys(platforms).toSorted();
    expect(keys).toEqual([...EXPECTED_PLATFORMS].toSorted());
    expect(keys).toHaveLength(9);
  });

  it("toggleKillSwitch flips active state", () => {
    expect(useTradingStore.getState().killSwitchActive).toBe(false);

    useTradingStore.getState().toggleKillSwitch();
    expect(useTradingStore.getState().killSwitchActive).toBe(true);
    expect(useTradingStore.getState().killSwitchReason).toBe("Manually activated");

    useTradingStore.getState().toggleKillSwitch();
    expect(useTradingStore.getState().killSwitchActive).toBe(false);
    expect(useTradingStore.getState().killSwitchReason).toBeUndefined();
  });

  it("setPolicy merges correctly", () => {
    const limitsBefore = { ...useTradingStore.getState().limits };

    useTradingStore.getState().setPolicy({ tier: "aggressive" });

    const state = useTradingStore.getState();
    expect(state.tier).toBe("aggressive");
    // approval mode should remain unchanged
    expect(state.approvalMode).toBe("confirm");
    // limits should remain unchanged
    expect(state.limits).toEqual(limitsBefore);
  });

  it("setPlatformOverride stores override", () => {
    useTradingStore.getState().setPlatformOverride("alpaca", { maxSingleTradeUsd: 200 });

    const overrides = useTradingStore.getState().perPlatformOverrides;
    expect(overrides.alpaca).toBeDefined();
    expect(overrides.alpaca.maxSingleTradeUsd).toBe(200);
  });

  it("clearPlatformOverride removes override", () => {
    useTradingStore.getState().setPlatformOverride("alpaca", { maxSingleTradeUsd: 200 });
    expect(useTradingStore.getState().perPlatformOverrides.alpaca).toBeDefined();

    useTradingStore.getState().clearPlatformOverride("alpaca");
    expect(useTradingStore.getState().perPlatformOverrides.alpaca).toBeUndefined();
  });

  it("togglePlatformKillSwitch works independently per platform", () => {
    useTradingStore.getState().togglePlatformKillSwitch("alpaca");

    const switches = useTradingStore.getState().platformKillSwitches;
    expect(switches.alpaca?.active).toBe(true);
    expect(switches.alpaca?.reason).toBe("Manually activated");

    // polymarket should be unaffected
    expect(switches.polymarket?.active ?? false).toBe(false);
  });

  it("Coinbase authScheme is ES256 JWT", () => {
    const { platforms } = useTradingStore.getState();
    expect(platforms.coinbase.api.authScheme).toBe("ES256 JWT (CDP Key)");
  });
});
