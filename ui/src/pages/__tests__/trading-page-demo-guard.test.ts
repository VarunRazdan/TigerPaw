import { afterEach, describe, expect, it } from "vitest";
import { useTradingStore } from "@/stores/trading-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore(demoMode: boolean) {
  useTradingStore.setState(
    {
      positions: [],
      tradeHistory: [],
      pendingApprovals: [],
      dailyPnlUsd: 0,
      dailySpendUsd: 0,
      dailyTradeCount: 0,
      consecutiveLosses: 0,
      currentPortfolioValueUsd: 0,
      highWaterMarkUsd: 0,
      demoMode,
    },
    true,
  );
}

/**
 * Reproduce the seeding guard from useDemoData() so we can test the logic
 * without mounting React components.
 */
function seedIfAllowed() {
  const store = useTradingStore.getState();

  // Must mirror the guard in TradingPage.tsx useDemoData()
  if (!store.demoMode || store.positions.length > 0) {
    return;
  }

  store.setPositions([
    {
      symbol: "TEST",
      extensionId: "test-ext",
      quantity: 1,
      valueUsd: 100,
      unrealizedPnl: 0,
      percentOfPortfolio: 1,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDemoData guard", () => {
  afterEach(() => {
    resetStore(true);
  });

  it("does NOT seed positions when demoMode is false", () => {
    resetStore(false);

    seedIfAllowed();

    const { positions } = useTradingStore.getState();
    expect(positions).toHaveLength(0);
  });

  it("seeds positions when demoMode is true and positions are empty", () => {
    resetStore(true);

    seedIfAllowed();

    const { positions } = useTradingStore.getState();
    expect(positions.length).toBeGreaterThan(0);
    expect(positions[0].symbol).toBe("TEST");
  });

  it("does NOT overwrite existing positions even in demo mode", () => {
    resetStore(true);

    // Pre-populate a position so the guard's length check triggers.
    useTradingStore.getState().setPositions([
      {
        symbol: "EXISTING",
        extensionId: "existing-ext",
        quantity: 10,
        valueUsd: 500,
        unrealizedPnl: 5,
        percentOfPortfolio: 50,
      },
    ]);

    seedIfAllowed();

    const { positions } = useTradingStore.getState();
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe("EXISTING");
  });

  it("seeds after switching from live back to demo mode", () => {
    // Start in live mode -- no seeding.
    resetStore(false);
    seedIfAllowed();
    expect(useTradingStore.getState().positions).toHaveLength(0);

    // Switch to demo mode -- seeding should happen.
    useTradingStore.setState({ demoMode: true });
    seedIfAllowed();
    expect(useTradingStore.getState().positions.length).toBeGreaterThan(0);
  });
});
