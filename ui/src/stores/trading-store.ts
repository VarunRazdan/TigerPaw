import { create } from "zustand";

export type ApprovalMode = "auto" | "confirm" | "manual";
export type TimeoutAction = "approve" | "deny";
export type RiskTier = "conservative" | "moderate" | "aggressive" | "custom";
export type KillSwitchMode = "hard" | "soft";

export type PendingApproval = {
  id: string;
  extensionId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  notionalUsd: number;
  riskPercent: number;
  mode: "confirm" | "manual";
  timeoutMs: number;
  createdAt: number;
};

export type Position = {
  symbol: string;
  extensionId: string;
  quantity: number;
  valueUsd: number;
  unrealizedPnl: number;
  percentOfPortfolio: number;
  stopLoss?: number;
  takeProfit?: number;
};

export type TradeHistoryEntry = {
  timestamp: string;
  approvalType: "auto_approved" | "manually_approved" | "denied" | "cancelled";
  extensionId: string;
  symbol: string;
  side: string;
  amount: number;
  result: "filled" | "denied" | "rejected" | "cancelled";
  reason?: string;
  expectedPrice?: number;
  executedPrice?: number;
};

export type PolicyLimits = {
  maxRiskPerTradePercent: number;
  dailyLossLimitPercent: number;
  maxPortfolioDrawdownPercent: number;
  maxSinglePositionPercent: number;
  maxTradesPerDay: number;
  maxOpenPositions: number;
  cooldownBetweenTradesMs: number;
  consecutiveLossPause: number;
  maxDailySpendUsd: number;
  maxSingleTradeUsd: number;
};

export type PerPlatformOverride = Partial<PolicyLimits> & {
  approvalMode?: ApprovalMode;
};

export type PlatformType =
  | "stocks"
  | "crypto"
  | "prediction"
  | "play_money"
  | "perpetuals"
  | "multi_asset";

export type PlatformApiInfo = {
  apiVersion: string;
  authScheme: string;
  connectionMethod: string;
  baseUrl: string;
  hasSandbox: boolean;
};

export type PlatformStatus = {
  connected: boolean;
  mode: "live" | "paper" | "demo" | "play" | "sandbox" | "testnet" | "mainnet";
  label: string;
  type: PlatformType;
  currencyLabel: string;
  accountInfo?: Record<string, unknown>;
  api: PlatformApiInfo;
};

export type PnlDataPoint = {
  date: string;
  pnl: number;
};

export type TradingState = {
  // Kill switch
  killSwitchActive: boolean;
  killSwitchMode: KillSwitchMode;
  killSwitchReason?: string;
  platformKillSwitches: Record<string, { active: boolean; reason?: string }>;

  // Daily metrics
  dailyPnlUsd: number;
  dailySpendUsd: number;
  dailyTradeCount: number;
  consecutiveLosses: number;
  currentPortfolioValueUsd: number;
  highWaterMarkUsd: number;

  // Policy
  approvalMode: ApprovalMode;
  tier: RiskTier;
  limits: PolicyLimits;
  confirmTimeoutMs: number;
  confirmTimeoutAction: TimeoutAction;
  manualTimeoutMs: number;
  manualTimeoutAction: TimeoutAction;

  // Positions & approvals
  positions: Position[];
  pendingApprovals: PendingApproval[];
  tradeHistory: TradeHistoryEntry[];

  // Per-platform status
  platforms: Record<string, PlatformStatus>;

  // Per-platform risk overrides
  perPlatformOverrides: Record<string, PerPlatformOverride>;

  // P&L history for charts
  pnlHistory: PnlDataPoint[];

  // Demo mode
  demoMode: boolean;

  // Actions
  setKillSwitch: (active: boolean, reason?: string) => void;
  toggleKillSwitch: () => void;
  setKillSwitchMode: (mode: KillSwitchMode) => void;
  updateDailyMetrics: (
    metrics: Partial<
      Pick<
        TradingState,
        | "dailyPnlUsd"
        | "dailySpendUsd"
        | "dailyTradeCount"
        | "consecutiveLosses"
        | "currentPortfolioValueUsd"
        | "highWaterMarkUsd"
      >
    >,
  ) => void;
  setPolicy: (
    policy: Partial<
      Pick<
        TradingState,
        | "approvalMode"
        | "tier"
        | "limits"
        | "confirmTimeoutMs"
        | "confirmTimeoutAction"
        | "manualTimeoutMs"
        | "manualTimeoutAction"
      >
    >,
  ) => void;
  setPositions: (positions: Position[]) => void;
  updatePositionStopLoss: (symbol: string, stopLoss: number | undefined) => void;
  updatePositionTakeProfit: (symbol: string, takeProfit: number | undefined) => void;
  addPendingApproval: (approval: PendingApproval) => void;
  removePendingApproval: (id: string) => void;
  setTradeHistory: (history: TradeHistoryEntry[]) => void;
  setPlatformStatus: (id: string, status: PlatformStatus) => void;
  setPlatformOverride: (id: string, override: PerPlatformOverride) => void;
  clearPlatformOverride: (id: string) => void;
  togglePlatformKillSwitch: (id: string) => void;
  disconnectPlatform: (id: string) => void;
  setPnlHistory: (history: PnlDataPoint[]) => void;
  setDemoMode: (enabled: boolean) => void;
};

const DEFAULT_LIMITS: PolicyLimits = {
  maxRiskPerTradePercent: 2,
  dailyLossLimitPercent: 5,
  maxPortfolioDrawdownPercent: 20,
  maxSinglePositionPercent: 10,
  maxTradesPerDay: 25,
  maxOpenPositions: 8,
  cooldownBetweenTradesMs: 30_000,
  consecutiveLossPause: 5,
  maxDailySpendUsd: 500,
  maxSingleTradeUsd: 100,
};

export const useTradingStore = create<TradingState>((set) => ({
  killSwitchActive: false,
  killSwitchMode: "hard",
  killSwitchReason: undefined,
  platformKillSwitches: {},
  dailyPnlUsd: 0,
  dailySpendUsd: 0,
  dailyTradeCount: 0,
  consecutiveLosses: 0,
  currentPortfolioValueUsd: 0,
  highWaterMarkUsd: 0,
  approvalMode: "confirm",
  tier: "moderate",
  limits: DEFAULT_LIMITS,
  confirmTimeoutMs: 30_000,
  confirmTimeoutAction: "deny",
  manualTimeoutMs: 300_000,
  manualTimeoutAction: "deny",
  positions: [],
  pendingApprovals: [],
  tradeHistory: [],
  platforms: {
    alpaca: {
      connected: false,
      mode: "paper",
      label: "Alpaca",
      type: "stocks",
      currencyLabel: "USD",
      api: {
        apiVersion: "v2",
        authScheme: "API Key Headers",
        connectionMethod: "REST",
        baseUrl: "api.alpaca.markets",
        hasSandbox: true,
      },
    },
    polymarket: {
      connected: false,
      mode: "live",
      label: "Polymarket",
      type: "prediction",
      currencyLabel: "USD",
      api: {
        apiVersion: "CLOB v1",
        authScheme: "HMAC-SHA256",
        connectionMethod: "REST",
        baseUrl: "clob.polymarket.com",
        hasSandbox: false,
      },
    },
    kalshi: {
      connected: false,
      mode: "demo",
      label: "Kalshi",
      type: "prediction",
      currencyLabel: "USD",
      api: {
        apiVersion: "v2",
        authScheme: "RSA-SHA256",
        connectionMethod: "REST",
        baseUrl: "trading-api.kalshi.com",
        hasSandbox: true,
      },
    },
    manifold: {
      connected: false,
      mode: "play",
      label: "Manifold",
      type: "play_money",
      currencyLabel: "Mana",
      api: {
        apiVersion: "v0",
        authScheme: "API Key Bearer",
        connectionMethod: "REST",
        baseUrl: "api.manifold.markets",
        hasSandbox: false,
      },
    },
    coinbase: {
      connected: false,
      mode: "sandbox",
      label: "Coinbase",
      type: "crypto",
      currencyLabel: "USD",
      api: {
        apiVersion: "v3",
        authScheme: "ES256 JWT (CDP Key)",
        connectionMethod: "REST",
        baseUrl: "api.coinbase.com",
        hasSandbox: true,
      },
    },
    ibkr: {
      connected: false,
      mode: "paper",
      label: "IBKR",
      type: "multi_asset",
      currencyLabel: "USD",
      api: {
        apiVersion: "v1",
        authScheme: "Session-based",
        connectionMethod: "REST (Gateway)",
        baseUrl: "localhost:5000",
        hasSandbox: true,
      },
    },
    binance: {
      connected: false,
      mode: "testnet",
      label: "Binance",
      type: "crypto",
      currencyLabel: "USD",
      api: {
        apiVersion: "v3",
        authScheme: "HMAC-SHA256",
        connectionMethod: "REST",
        baseUrl: "api.binance.com",
        hasSandbox: true,
      },
    },
    kraken: {
      connected: false,
      mode: "live",
      label: "Kraken",
      type: "crypto",
      currencyLabel: "USD",
      api: {
        apiVersion: "v0",
        authScheme: "HMAC-SHA512",
        connectionMethod: "REST",
        baseUrl: "api.kraken.com",
        hasSandbox: false,
      },
    },
    dydx: {
      connected: false,
      mode: "testnet",
      label: "dYdX",
      type: "perpetuals",
      currencyLabel: "USD",
      api: {
        apiVersion: "v4",
        authScheme: "Cosmos SDK",
        connectionMethod: "REST + gRPC",
        baseUrl: "indexer.dydx.trade",
        hasSandbox: true,
      },
    },
  },
  perPlatformOverrides: {},
  pnlHistory: [],

  demoMode: false,

  setKillSwitch: (active, reason) => set({ killSwitchActive: active, killSwitchReason: reason }),
  toggleKillSwitch: () =>
    set((s) => ({
      killSwitchActive: !s.killSwitchActive,
      killSwitchReason: s.killSwitchActive ? undefined : "Manually activated",
    })),
  setKillSwitchMode: (mode) => set({ killSwitchMode: mode }),
  updateDailyMetrics: (metrics) => set((s) => ({ ...s, ...metrics })),
  setPolicy: (policy) => set((s) => ({ ...s, ...policy })),
  setPositions: (positions) => set({ positions }),
  updatePositionStopLoss: (symbol, stopLoss) =>
    set((s) => ({
      positions: s.positions.map((p) => (p.symbol === symbol ? { ...p, stopLoss } : p)),
    })),
  updatePositionTakeProfit: (symbol, takeProfit) =>
    set((s) => ({
      positions: s.positions.map((p) => (p.symbol === symbol ? { ...p, takeProfit } : p)),
    })),
  addPendingApproval: (approval) =>
    set((s) => ({
      pendingApprovals: [...s.pendingApprovals, approval],
    })),
  removePendingApproval: (id) =>
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((a) => a.id !== id),
    })),
  setTradeHistory: (history) => set({ tradeHistory: history }),
  setPlatformStatus: (id, status) =>
    set((s) => ({
      platforms: { ...s.platforms, [id]: status },
    })),
  setPlatformOverride: (id, override) =>
    set((s) => ({
      perPlatformOverrides: { ...s.perPlatformOverrides, [id]: override },
    })),
  clearPlatformOverride: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.perPlatformOverrides;
      return { perPlatformOverrides: rest };
    }),
  togglePlatformKillSwitch: (id) =>
    set((s) => {
      const current = s.platformKillSwitches[id];
      const isActive = current?.active ?? false;
      return {
        platformKillSwitches: {
          ...s.platformKillSwitches,
          [id]: {
            active: !isActive,
            reason: isActive ? undefined : "Manually activated",
          },
        },
      };
    }),
  disconnectPlatform: (id) =>
    set((s) => {
      const platform = s.platforms[id];
      if (!platform) {
        return s;
      }
      return {
        platforms: { ...s.platforms, [id]: { ...platform, connected: false } },
      };
    }),
  setPnlHistory: (history) => set({ pnlHistory: history }),
  setDemoMode: (enabled) =>
    set((s) => {
      if (!enabled) {
        return {
          demoMode: false,
          positions: [],
          pendingApprovals: [],
          tradeHistory: [],
          pnlHistory: [],
          dailyPnlUsd: 0,
          dailySpendUsd: 0,
          dailyTradeCount: 0,
          consecutiveLosses: 0,
          currentPortfolioValueUsd: 0,
          highWaterMarkUsd: 0,
        };
      }

      // Populate demo data
      return {
        demoMode: true,
        dailyPnlUsd: 178.5,
        dailySpendUsd: 312,
        dailyTradeCount: 4,
        consecutiveLosses: 0,
        currentPortfolioValueUsd: 47_500,
        highWaterMarkUsd: 48_200,
        positions: [
          {
            symbol: "AAPL",
            extensionId: "alpaca",
            quantity: 15,
            valueUsd: 3_285,
            unrealizedPnl: 67.5,
            percentOfPortfolio: 6.9,
            stopLoss: 212,
            takeProfit: 228,
          },
          {
            symbol: "TSLA",
            extensionId: "alpaca",
            quantity: 5,
            valueUsd: 1_375,
            unrealizedPnl: -22.3,
            percentOfPortfolio: 2.9,
            stopLoss: 268,
          },
          {
            symbol: "BTC $150k by 2026?",
            extensionId: "polymarket",
            quantity: 100,
            valueUsd: 62,
            unrealizedPnl: 8,
            percentOfPortfolio: 0.1,
          },
          {
            symbol: "Fed rate cut Jul 2026?",
            extensionId: "kalshi",
            quantity: 50,
            valueUsd: 32.5,
            unrealizedPnl: 4.25,
            percentOfPortfolio: 0.1,
          },
          {
            symbol: "US GDP > 3%?",
            extensionId: "manifold",
            quantity: 200,
            valueUsd: 180,
            unrealizedPnl: 12,
            percentOfPortfolio: 0.4,
          },
        ],
        pendingApprovals: [
          {
            id: "pa-1",
            extensionId: "alpaca",
            symbol: "NVDA",
            side: "buy" as const,
            quantity: 10,
            notionalUsd: 1_340,
            riskPercent: 2.8,
            mode: "confirm" as const,
            timeoutMs: 15_000,
            createdAt: Date.now() - 5_000,
          },
          {
            id: "pa-2",
            extensionId: "polymarket",
            symbol: "AI passes bar exam?",
            side: "buy" as const,
            quantity: 50,
            notionalUsd: 25,
            riskPercent: 0.05,
            mode: "manual" as const,
            timeoutMs: 300_000,
            createdAt: Date.now() - 30_000,
          },
        ],
        tradeHistory: [
          {
            timestamp: "2026-03-23T14:32:00Z",
            approvalType: "auto_approved" as const,
            extensionId: "alpaca",
            symbol: "AAPL",
            side: "buy",
            amount: 219.5,
            result: "filled" as const,
            expectedPrice: 219,
            executedPrice: 219.5,
          },
          {
            timestamp: "2026-03-23T11:15:00Z",
            approvalType: "manually_approved" as const,
            extensionId: "polymarket",
            symbol: "BTC $150k by 2026?",
            side: "buy",
            amount: 30,
            result: "filled" as const,
            expectedPrice: 0.62,
            executedPrice: 0.62,
          },
          {
            timestamp: "2026-03-22T16:45:00Z",
            approvalType: "auto_approved" as const,
            extensionId: "alpaca",
            symbol: "TSLA",
            side: "buy",
            amount: 275,
            result: "filled" as const,
            expectedPrice: 274,
            executedPrice: 275,
          },
          {
            timestamp: "2026-03-22T10:20:00Z",
            approvalType: "denied" as const,
            extensionId: "alpaca",
            symbol: "NVDA",
            side: "buy",
            amount: 2_400,
            result: "denied" as const,
            reason: "Exceeds maxSingleTradeUsd ($100)",
          },
          {
            timestamp: "2026-03-21T15:30:00Z",
            approvalType: "auto_approved" as const,
            extensionId: "kalshi",
            symbol: "Fed rate cut Jul 2026?",
            side: "buy",
            amount: 32.5,
            result: "filled" as const,
            expectedPrice: 0.65,
            executedPrice: 0.65,
          },
          {
            timestamp: "2026-03-21T09:12:00Z",
            approvalType: "auto_approved" as const,
            extensionId: "alpaca",
            symbol: "MSFT",
            side: "sell",
            amount: 420,
            result: "filled" as const,
            expectedPrice: 420,
            executedPrice: 419.8,
          },
          {
            timestamp: "2026-03-20T14:55:00Z",
            approvalType: "manually_approved" as const,
            extensionId: "manifold",
            symbol: "US GDP > 3%?",
            side: "buy",
            amount: 90,
            result: "filled" as const,
          },
          {
            timestamp: "2026-03-20T11:30:00Z",
            approvalType: "cancelled" as const,
            extensionId: "polymarket",
            symbol: "Trump wins 2028?",
            side: "buy",
            amount: 50,
            result: "cancelled" as const,
            reason: "User cancelled before timeout",
          },
          {
            timestamp: "2026-03-19T16:10:00Z",
            approvalType: "auto_approved" as const,
            extensionId: "alpaca",
            symbol: "AAPL",
            side: "buy",
            amount: 218,
            result: "filled" as const,
            expectedPrice: 217.5,
            executedPrice: 218,
          },
          {
            timestamp: "2026-03-19T10:45:00Z",
            approvalType: "auto_approved" as const,
            extensionId: "alpaca",
            symbol: "NVDA",
            side: "sell",
            amount: 134,
            result: "filled" as const,
            expectedPrice: 134,
            executedPrice: 133.8,
          },
          {
            timestamp: "2026-03-18T13:20:00Z",
            approvalType: "manually_approved" as const,
            extensionId: "kalshi",
            symbol: "Next Fed chair?",
            side: "buy",
            amount: 15,
            result: "filled" as const,
            expectedPrice: 0.3,
            executedPrice: 0.3,
          },
          {
            timestamp: "2026-03-17T15:00:00Z",
            approvalType: "auto_approved" as const,
            extensionId: "alpaca",
            symbol: "TSLA",
            side: "sell",
            amount: 285,
            result: "filled" as const,
            expectedPrice: 286,
            executedPrice: 285,
          },
        ],
        platforms: {
          ...s.platforms,
          alpaca: { ...s.platforms.alpaca, connected: true },
          polymarket: { ...s.platforms.polymarket, connected: true },
          kalshi: { ...s.platforms.kalshi, connected: true },
          manifold: { ...s.platforms.manifold, connected: true },
          coinbase: { ...s.platforms.coinbase, connected: true },
          ibkr: { ...s.platforms.ibkr, connected: true },
          kraken: { ...s.platforms.kraken, connected: true },
        },
        pnlHistory: [
          { date: "Mar 10", pnl: 85 },
          { date: "Mar 11", pnl: -32 },
          { date: "Mar 12", pnl: 145 },
          { date: "Mar 13", pnl: 62 },
          { date: "Mar 14", pnl: -98 },
          { date: "Mar 15", pnl: 210 },
          { date: "Mar 16", pnl: 120 },
          { date: "Mar 17", pnl: -45 },
          { date: "Mar 18", pnl: 230 },
          { date: "Mar 19", pnl: -180 },
          { date: "Mar 20", pnl: 65 },
          { date: "Mar 21", pnl: -12 },
          { date: "Mar 22", pnl: 155 },
          { date: "Mar 23", pnl: 178.5 },
        ],
      };
    }),
}));
