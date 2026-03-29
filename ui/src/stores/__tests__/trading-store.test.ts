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

  // --- Extended tests ---

  describe("setKillSwitch", () => {
    it("sets active and reason", () => {
      useTradingStore.getState().setKillSwitch(true, "Daily loss limit");
      const s = useTradingStore.getState();
      expect(s.killSwitchActive).toBe(true);
      expect(s.killSwitchReason).toBe("Daily loss limit");
    });

    it("clears reason when deactivating", () => {
      useTradingStore.getState().setKillSwitch(true, "Test");
      useTradingStore.getState().setKillSwitch(false);
      const s = useTradingStore.getState();
      expect(s.killSwitchActive).toBe(false);
      expect(s.killSwitchReason).toBeUndefined();
    });
  });

  describe("setKillSwitchMode", () => {
    it("sets mode to soft", () => {
      useTradingStore.getState().setKillSwitchMode("soft");
      expect(useTradingStore.getState().killSwitchMode).toBe("soft");
    });

    it("sets mode to hard", () => {
      useTradingStore.getState().setKillSwitchMode("soft");
      useTradingStore.getState().setKillSwitchMode("hard");
      expect(useTradingStore.getState().killSwitchMode).toBe("hard");
    });
  });

  describe("updateDailyMetrics", () => {
    it("partially merges metrics", () => {
      useTradingStore.getState().updateDailyMetrics({ dailyPnlUsd: 500 });
      const s = useTradingStore.getState();
      expect(s.dailyPnlUsd).toBe(500);
      // Other metrics unchanged
      expect(s.dailyTradeCount).toBe(initialState.dailyTradeCount);
    });

    it("can update multiple metrics at once", () => {
      useTradingStore.getState().updateDailyMetrics({
        dailyPnlUsd: -200,
        consecutiveLosses: 3,
        dailyTradeCount: 15,
      });
      const s = useTradingStore.getState();
      expect(s.dailyPnlUsd).toBe(-200);
      expect(s.consecutiveLosses).toBe(3);
      expect(s.dailyTradeCount).toBe(15);
    });
  });

  describe("setPositions", () => {
    it("replaces the positions array", () => {
      const newPositions = [
        {
          symbol: "GOOG",
          extensionId: "alpaca",
          quantity: 3,
          valueUsd: 500,
          unrealizedPnl: 10,
          percentOfPortfolio: 1,
        },
      ];
      useTradingStore.getState().setPositions(newPositions);
      expect(useTradingStore.getState().positions).toEqual(newPositions);
    });
  });

  describe("updatePositionStopLoss", () => {
    it("updates matching symbol", () => {
      // Seed a position first
      useTradingStore
        .getState()
        .setPositions([
          {
            symbol: "AAPL",
            extensionId: "alpaca",
            quantity: 15,
            valueUsd: 3285,
            unrealizedPnl: 67.5,
            percentOfPortfolio: 6.9,
            stopLoss: 212,
          },
        ]);
      useTradingStore.getState().updatePositionStopLoss("AAPL", 200);
      const pos = useTradingStore.getState().positions.find((p) => p.symbol === "AAPL");
      expect(pos?.stopLoss).toBe(200);
    });

    it("does not affect other positions", () => {
      useTradingStore.getState().setPositions([
        {
          symbol: "AAPL",
          extensionId: "alpaca",
          quantity: 15,
          valueUsd: 3285,
          unrealizedPnl: 67.5,
          percentOfPortfolio: 6.9,
          stopLoss: 212,
        },
        {
          symbol: "TSLA",
          extensionId: "alpaca",
          quantity: 5,
          valueUsd: 1375,
          unrealizedPnl: -22.3,
          percentOfPortfolio: 2.9,
          stopLoss: 268,
        },
      ]);
      useTradingStore.getState().updatePositionStopLoss("AAPL", 200);
      const tsla = useTradingStore.getState().positions.find((p) => p.symbol === "TSLA");
      expect(tsla?.stopLoss).toBe(268);
    });

    it("can clear stop loss with undefined", () => {
      useTradingStore
        .getState()
        .setPositions([
          {
            symbol: "AAPL",
            extensionId: "alpaca",
            quantity: 15,
            valueUsd: 3285,
            unrealizedPnl: 67.5,
            percentOfPortfolio: 6.9,
            stopLoss: 212,
          },
        ]);
      useTradingStore.getState().updatePositionStopLoss("AAPL", undefined);
      const pos = useTradingStore.getState().positions.find((p) => p.symbol === "AAPL");
      expect(pos?.stopLoss).toBeUndefined();
    });
  });

  describe("updatePositionTakeProfit", () => {
    it("updates matching symbol", () => {
      useTradingStore
        .getState()
        .setPositions([
          {
            symbol: "AAPL",
            extensionId: "alpaca",
            quantity: 15,
            valueUsd: 3285,
            unrealizedPnl: 67.5,
            percentOfPortfolio: 6.9,
          },
        ]);
      useTradingStore.getState().updatePositionTakeProfit("AAPL", 250);
      const pos = useTradingStore.getState().positions.find((p) => p.symbol === "AAPL");
      expect(pos?.takeProfit).toBe(250);
    });
  });

  describe("addPendingApproval", () => {
    it("appends to existing approvals", () => {
      expect(useTradingStore.getState().pendingApprovals).toHaveLength(0);
      useTradingStore.getState().addPendingApproval({
        id: "pa-new",
        extensionId: "alpaca",
        symbol: "GOOG",
        side: "buy",
        quantity: 5,
        notionalUsd: 900,
        riskPercent: 1.9,
        mode: "confirm",
        timeoutMs: 15_000,
        createdAt: Date.now(),
      });
      expect(useTradingStore.getState().pendingApprovals).toHaveLength(1);
    });
  });

  describe("removePendingApproval", () => {
    it("removes by id", () => {
      useTradingStore.getState().addPendingApproval({
        id: "pa-1",
        extensionId: "alpaca",
        symbol: "NVDA",
        side: "buy",
        quantity: 10,
        notionalUsd: 1340,
        riskPercent: 2.8,
        mode: "confirm",
        timeoutMs: 15_000,
        createdAt: Date.now(),
      });
      useTradingStore.getState().removePendingApproval("pa-1");
      const ids = useTradingStore.getState().pendingApprovals.map((a) => a.id);
      expect(ids).not.toContain("pa-1");
    });

    it("no-op for unknown id", () => {
      const before = useTradingStore.getState().pendingApprovals.length;
      useTradingStore.getState().removePendingApproval("nonexistent");
      expect(useTradingStore.getState().pendingApprovals).toHaveLength(before);
    });
  });

  describe("setTradeHistory", () => {
    it("replaces history array", () => {
      useTradingStore.getState().setTradeHistory([]);
      expect(useTradingStore.getState().tradeHistory).toEqual([]);
    });
  });

  describe("setPlatformStatus", () => {
    it("adds or overwrites a platform", () => {
      const newStatus = {
        connected: true,
        mode: "live" as const,
        label: "TestExchange",
        type: "crypto" as const,
        currencyLabel: "USD",
        api: {
          apiVersion: "v1",
          authScheme: "API Key",
          connectionMethod: "REST",
          baseUrl: "api.test.com",
          hasSandbox: false,
        },
      };
      useTradingStore.getState().setPlatformStatus("test-exchange", newStatus);
      expect(useTradingStore.getState().platforms["test-exchange"]).toEqual(newStatus);
    });
  });

  describe("disconnectPlatform", () => {
    it("sets connected to false", () => {
      // First connect it
      const alpaca = useTradingStore.getState().platforms.alpaca;
      useTradingStore.getState().setPlatformStatus("alpaca", { ...alpaca, connected: true });
      expect(useTradingStore.getState().platforms.alpaca.connected).toBe(true);

      useTradingStore.getState().disconnectPlatform("alpaca");
      expect(useTradingStore.getState().platforms.alpaca.connected).toBe(false);
    });

    it("no-op for unknown platform id", () => {
      const before = { ...useTradingStore.getState().platforms };
      useTradingStore.getState().disconnectPlatform("nonexistent");
      expect(useTradingStore.getState().platforms).toEqual(before);
    });

    it("preserves other platform fields", () => {
      const alpaca = useTradingStore.getState().platforms.alpaca;
      useTradingStore.getState().setPlatformStatus("alpaca", { ...alpaca, connected: true });
      const before = useTradingStore.getState().platforms.alpaca;
      useTradingStore.getState().disconnectPlatform("alpaca");
      const after = useTradingStore.getState().platforms.alpaca;
      expect(after.mode).toBe(before.mode);
      expect(after.label).toBe(before.label);
      expect(after.api).toEqual(before.api);
    });
  });

  describe("setPnlHistory", () => {
    it("replaces pnl history array", () => {
      const newHistory = [{ date: "Jan 1", pnl: 100 }];
      useTradingStore.getState().setPnlHistory(newHistory);
      expect(useTradingStore.getState().pnlHistory).toEqual(newHistory);
    });
  });

  describe("initial state is empty (no demo data)", () => {
    it("has empty positions", () => {
      expect(initialState.positions).toEqual([]);
    });

    it("has empty trade history", () => {
      expect(initialState.tradeHistory).toEqual([]);
    });

    it("has empty pending approvals", () => {
      expect(initialState.pendingApprovals).toEqual([]);
    });

    it("has empty pnl history", () => {
      expect(initialState.pnlHistory).toEqual([]);
    });

    it("has zero portfolio value", () => {
      expect(initialState.currentPortfolioValueUsd).toBe(0);
    });

    it("all platforms disconnected by default", () => {
      for (const p of Object.values(initialState.platforms)) {
        expect(p.connected).toBe(false);
      }
    });

    it("demoMode defaults to false", () => {
      expect(initialState.demoMode).toBe(false);
    });
  });

  describe("setDemoMode", () => {
    it("populates demo data when enabled", () => {
      useTradingStore.getState().setDemoMode(true);
      const s = useTradingStore.getState();
      expect(s.demoMode).toBe(true);
      expect(s.positions.length).toBeGreaterThan(0);
      expect(s.tradeHistory.length).toBeGreaterThan(0);
      expect(s.pendingApprovals.length).toBeGreaterThan(0);
      expect(s.pnlHistory.length).toBeGreaterThan(0);
      expect(s.currentPortfolioValueUsd).toBeGreaterThan(0);
    });

    it("connects demo platforms", () => {
      useTradingStore.getState().setDemoMode(true);
      const { platforms } = useTradingStore.getState();
      expect(platforms.alpaca.connected).toBe(true);
      expect(platforms.polymarket.connected).toBe(true);
      expect(platforms.kraken.connected).toBe(true);
    });

    it("clears demo data when disabled", () => {
      useTradingStore.getState().setDemoMode(true);
      useTradingStore.getState().setDemoMode(false);
      const s = useTradingStore.getState();
      expect(s.demoMode).toBe(false);
      expect(s.positions).toEqual([]);
      expect(s.tradeHistory).toEqual([]);
      expect(s.pendingApprovals).toEqual([]);
      expect(s.pnlHistory).toEqual([]);
      expect(s.currentPortfolioValueUsd).toBe(0);
    });
  });
});
