import { describe, expect, it } from "vitest";
import {
  withPlatformPortfolio,
  withPlatformPositionCount,
  type TradingPolicyState,
} from "./policy-state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSampleState(overrides: Partial<TradingPolicyState> = {}): TradingPolicyState {
  return {
    date: new Date().toISOString().slice(0, 10),
    dailyPnlUsd: 0,
    dailySpendUsd: 0,
    dailyTradeCount: 0,
    consecutiveLosses: 0,
    highWaterMarkUsd: 10_000,
    currentPortfolioValueUsd: 10_000,
    openPositionCount: 0,
    positionCountByPlatform: {},
    portfolioByPlatform: {},
    positionsByAsset: {},
    lastTradeAtMs: 0,
    killSwitch: { active: false },
    platformKillSwitches: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("policy-state aggregation helpers", () => {
  describe("withPlatformPositionCount", () => {
    it("aggregates counts across platforms", () => {
      let state = createSampleState();
      const afterAlpaca = withPlatformPositionCount(state, "alpaca", 3);
      state = { ...state, ...afterAlpaca };
      const afterBinance = withPlatformPositionCount(state, "binance", 5);

      expect(afterBinance.openPositionCount).toBe(8);
      expect(afterBinance.positionCountByPlatform).toEqual({
        alpaca: 3,
        binance: 5,
      });
    });

    it("updates existing platform count", () => {
      let state = createSampleState();
      const afterFirst = withPlatformPositionCount(state, "alpaca", 3);
      state = { ...state, ...afterFirst };
      const afterUpdate = withPlatformPositionCount(state, "alpaca", 1);

      expect(afterUpdate.openPositionCount).toBe(1);
      expect(afterUpdate.positionCountByPlatform).toEqual({
        alpaca: 1,
      });
    });

    it("handles empty state", () => {
      const state = createSampleState({ positionCountByPlatform: {} });
      const result = withPlatformPositionCount(state, "alpaca", 3);

      expect(result.openPositionCount).toBe(3);
      expect(result.positionCountByPlatform).toEqual({ alpaca: 3 });
    });
  });

  describe("withPlatformPortfolio", () => {
    it("aggregates values across platforms", () => {
      let state = createSampleState();
      const afterAlpaca = withPlatformPortfolio(state, "alpaca", 5000);
      state = { ...state, ...afterAlpaca };
      const afterBinance = withPlatformPortfolio(state, "binance", 3000);

      expect(afterBinance.currentPortfolioValueUsd).toBe(8000);
      expect(afterBinance.portfolioByPlatform).toEqual({
        alpaca: 5000,
        binance: 3000,
      });
    });
  });
});
