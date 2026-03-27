import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../app-store";

const initialState = useAppStore.getState();

describe("app-store", () => {
  beforeEach(() => {
    useAppStore.setState(initialState, true);
  });

  it("initial state has tradingEnabled true and configLoaded false", () => {
    const s = useAppStore.getState();
    expect(s.tradingEnabled).toBe(true);
    expect(s.configLoaded).toBe(false);
  });

  it("setTradingEnabled toggles trading", () => {
    useAppStore.getState().setTradingEnabled(false);
    expect(useAppStore.getState().tradingEnabled).toBe(false);

    useAppStore.getState().setTradingEnabled(true);
    expect(useAppStore.getState().tradingEnabled).toBe(true);
  });

  it("setConfigLoaded sets flag to true", () => {
    expect(useAppStore.getState().configLoaded).toBe(false);
    useAppStore.getState().setConfigLoaded();
    expect(useAppStore.getState().configLoaded).toBe(true);
  });

  it("setConfigLoaded is idempotent", () => {
    useAppStore.getState().setConfigLoaded();
    useAppStore.getState().setConfigLoaded();
    expect(useAppStore.getState().configLoaded).toBe(true);
  });
});
