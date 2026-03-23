import { create } from "zustand";

export type ApprovalMode = "auto" | "confirm" | "manual";
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

export type PlatformApiInfo = {
  apiVersion: string;
  authScheme: string;
  connectionMethod: string;
  baseUrl: string;
  hasSandbox: boolean;
};

export type PlatformStatus = {
  connected: boolean;
  mode: "live" | "paper" | "demo" | "play";
  label: string;
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
  setPolicy: (policy: Partial<Pick<TradingState, "approvalMode" | "tier" | "limits">>) => void;
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
  setPnlHistory: (history: PnlDataPoint[]) => void;
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
  positions: [],
  pendingApprovals: [],
  tradeHistory: [],
  platforms: {
    alpaca: {
      connected: true,
      mode: "paper",
      label: "Alpaca",
      api: {
        apiVersion: "v2",
        authScheme: "API Key Headers",
        connectionMethod: "REST",
        baseUrl: "api.alpaca.markets",
        hasSandbox: true,
      },
    },
    polymarket: {
      connected: true,
      mode: "live",
      label: "Polymarket",
      api: {
        apiVersion: "CLOB v1",
        authScheme: "HMAC-SHA256",
        connectionMethod: "REST",
        baseUrl: "clob.polymarket.com",
        hasSandbox: false,
      },
    },
    kalshi: {
      connected: true,
      mode: "demo",
      label: "Kalshi",
      api: {
        apiVersion: "v2",
        authScheme: "RSA-SHA256",
        connectionMethod: "REST",
        baseUrl: "trading-api.kalshi.com",
        hasSandbox: true,
      },
    },
    manifold: {
      connected: true,
      mode: "play",
      label: "Manifold",
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
      mode: "demo",
      label: "Coinbase",
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
      mode: "demo",
      label: "Binance",
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
      mode: "demo",
      label: "Kraken",
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
      mode: "demo",
      label: "dYdX",
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
  setPnlHistory: (history) => set({ pnlHistory: history }),
}));
