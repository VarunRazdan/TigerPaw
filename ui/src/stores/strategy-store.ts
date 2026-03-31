import { create } from "zustand";
import { gatewayRpc } from "@/lib/gateway-rpc";

export type SignalConfig = {
  id: string;
  type: string;
  params: Record<string, number | string | boolean>;
  weight: number;
};

export type StrategyDefinition = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  symbols: string[];
  extensionId: string;
  signals: SignalConfig[];
  entryRule: { minSignalStrength: number; orderType: string; limitOffsetPercent?: number };
  exitRule: {
    stopLossPercent?: number;
    takeProfitPercent?: number;
    trailingStopPercent?: number;
    maxHoldMs?: number;
  };
  positionSizing: {
    method: string;
    fixedUsd?: number;
    percentPortfolio?: number;
    maxPositionPercent: number;
  };
  schedule: "continuous" | "interval";
  intervalMs?: number;
  maxDailyLossUsd?: number;
  maxConcurrentPositions?: number;
  killOnConsecutiveLosses?: number;
  lastExecutedAt?: string;
  totalTrades: number;
  winRate: number;
  totalPnlUsd: number;
};

export type StrategyExecution = {
  id: string;
  strategyId: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  ordersSubmitted: number;
  pnlUsd: number;
  error?: string;
};

export type BacktestMetrics = {
  totalReturn: number;
  annualizedReturn: number;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdownPercent: number;
  maxDrawdownUsd: number;
  calmarRatio: number | null;
  winRate: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  totalPnl: number;
  totalTrades: number;
  tradingDays: number;
};

export type BacktestTrade = {
  barIndex: number;
  timestamp: number;
  side: "buy" | "sell";
  symbol: string;
  quantity: number;
  price: number;
  commission: number;
  pnlUsd: number;
  portfolioValueUsd: number;
};

export type EquityPoint = {
  timestamp: number;
  equity: number;
};

export type BacktestResult = {
  id: string;
  strategyId: string;
  completedAt: string;
  durationMs: number;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
};

type StrategyState = {
  strategies: StrategyDefinition[];
  executions: StrategyExecution[];
  selectedStrategyId: string | null;
  backtestResult: BacktestResult | null;
  backtestRunning: boolean;
  loading: boolean;
  error: string | null;
  demoMode: boolean;

  // Actions
  fetchStrategies: () => Promise<void>;
  fetchExecutions: (strategyId?: string) => Promise<void>;
  saveStrategy: (strategy: Partial<StrategyDefinition>) => Promise<void>;
  deleteStrategy: (id: string) => Promise<void>;
  toggleStrategy: (id: string, enabled: boolean) => Promise<void>;
  selectStrategy: (id: string | null) => void;
  runBacktest: (
    strategyId: string,
    config?: {
      symbol?: string;
      days?: number;
      initialCapitalUsd?: number;
      dataSource?: "synthetic" | "alpaca";
    },
  ) => Promise<void>;
  clearBacktest: () => void;
  setDemoMode: (enabled: boolean) => void;
};

const DEMO_STRATEGIES: StrategyDefinition[] = [
  {
    id: "demo-momentum-1",
    name: "RSI Momentum",
    description: "Enters long when RSI crosses above 30, exits on RSI > 70 or trailing stop",
    enabled: true,
    version: 3,
    createdAt: "2025-11-15T08:00:00Z",
    updatedAt: "2026-03-28T14:22:00Z",
    symbols: ["AAPL", "MSFT", "GOOGL"],
    extensionId: "alpaca",
    signals: [
      {
        id: "sig-rsi",
        type: "rsi",
        params: { period: 14, overbought: 70, oversold: 30 },
        weight: 0.6,
      },
      { id: "sig-vol", type: "volume_spike", params: { threshold: 1.5 }, weight: 0.4 },
    ],
    entryRule: { minSignalStrength: 0.55, orderType: "limit", limitOffsetPercent: 0.1 },
    exitRule: { stopLossPercent: 3, takeProfitPercent: 8, trailingStopPercent: 2 },
    positionSizing: { method: "percent_portfolio", percentPortfolio: 5, maxPositionPercent: 10 },
    schedule: "interval",
    intervalMs: 60_000,
    maxDailyLossUsd: 500,
    maxConcurrentPositions: 3,
    totalTrades: 147,
    winRate: 58.5,
    totalPnlUsd: 2340.75,
  },
  {
    id: "demo-mean-revert-1",
    name: "Bollinger Mean Reversion",
    description: "Fades moves outside Bollinger Bands with volume confirmation",
    enabled: true,
    version: 1,
    createdAt: "2026-01-20T10:30:00Z",
    updatedAt: "2026-03-25T09:15:00Z",
    symbols: ["SPY", "QQQ"],
    extensionId: "alpaca",
    signals: [
      { id: "sig-bb", type: "bollinger_bands", params: { period: 20, stdDev: 2 }, weight: 0.7 },
      {
        id: "sig-rsi2",
        type: "rsi",
        params: { period: 7, overbought: 80, oversold: 20 },
        weight: 0.3,
      },
    ],
    entryRule: { minSignalStrength: 0.6, orderType: "market" },
    exitRule: { stopLossPercent: 2, takeProfitPercent: 4 },
    positionSizing: { method: "fixed_usd", fixedUsd: 2000, maxPositionPercent: 15 },
    schedule: "interval",
    intervalMs: 300_000,
    maxDailyLossUsd: 300,
    totalTrades: 63,
    winRate: 62.1,
    totalPnlUsd: 890.5,
  },
  {
    id: "demo-prediction-arb",
    name: "Prediction Market Arbitrage",
    description: "Monitors cross-platform price discrepancies on prediction markets",
    enabled: false,
    version: 2,
    createdAt: "2026-02-10T16:00:00Z",
    updatedAt: "2026-03-20T11:45:00Z",
    symbols: ["POLYMARKET:PRES2028", "KALSHI:PRES2028"],
    extensionId: "polymarket",
    signals: [
      {
        id: "sig-spread",
        type: "cross_platform_spread",
        params: { minSpreadPercent: 3 },
        weight: 1.0,
      },
    ],
    entryRule: { minSignalStrength: 0.8, orderType: "limit", limitOffsetPercent: 0.5 },
    exitRule: { takeProfitPercent: 2, maxHoldMs: 86_400_000 },
    positionSizing: { method: "fixed_usd", fixedUsd: 500, maxPositionPercent: 20 },
    schedule: "continuous",
    killOnConsecutiveLosses: 5,
    totalTrades: 28,
    winRate: 71.4,
    totalPnlUsd: 412.3,
  },
];

const DEMO_EXECUTIONS: StrategyExecution[] = [
  {
    id: "exec-1",
    strategyId: "demo-momentum-1",
    startedAt: "2026-03-31T09:30:00Z",
    completedAt: "2026-03-31T09:30:02Z",
    status: "completed",
    ordersSubmitted: 2,
    pnlUsd: 45.2,
  },
  {
    id: "exec-2",
    strategyId: "demo-momentum-1",
    startedAt: "2026-03-31T10:31:00Z",
    completedAt: "2026-03-31T10:31:01Z",
    status: "completed",
    ordersSubmitted: 1,
    pnlUsd: -12.5,
  },
  {
    id: "exec-3",
    strategyId: "demo-mean-revert-1",
    startedAt: "2026-03-31T10:00:00Z",
    completedAt: "2026-03-31T10:00:03Z",
    status: "completed",
    ordersSubmitted: 1,
    pnlUsd: 28.9,
  },
  {
    id: "exec-4",
    strategyId: "demo-prediction-arb",
    startedAt: "2026-03-30T14:15:00Z",
    completedAt: "2026-03-30T14:15:01Z",
    status: "error",
    ordersSubmitted: 0,
    pnlUsd: 0,
    error: "Extension offline",
  },
];

export const useStrategyStore = create<StrategyState>((set, get) => ({
  strategies: [],
  executions: [],
  selectedStrategyId: null,
  backtestResult: null,
  backtestRunning: false,
  loading: false,
  error: null,
  demoMode: false,

  fetchStrategies: async () => {
    if (get().demoMode) {
      set({ strategies: DEMO_STRATEGIES, executions: DEMO_EXECUTIONS, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const res = await gatewayRpc("strategies.list", {});
      if (res.ok) {
        set({ strategies: (res.payload as Record<string, unknown>).strategies ?? [] });
      }
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },

  fetchExecutions: async (strategyId?: string) => {
    if (get().demoMode) {
      set({
        executions: strategyId
          ? DEMO_EXECUTIONS.filter((e) => e.strategyId === strategyId)
          : DEMO_EXECUTIONS,
      });
      return;
    }
    try {
      const res = await gatewayRpc("strategies.executions", { strategyId });
      if (res.ok) {
        set({ executions: (res.payload as Record<string, unknown>).executions ?? [] });
      }
    } catch {
      // silent
    }
  },

  saveStrategy: async (strategy) => {
    set({ error: null });
    try {
      const res = await gatewayRpc("strategies.save", strategy as Record<string, unknown>);
      if (res.ok) {
        await get().fetchStrategies();
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteStrategy: async (id) => {
    try {
      await gatewayRpc("strategies.delete", { id });
      await get().fetchStrategies();
      if (get().selectedStrategyId === id) {
        set({ selectedStrategyId: null });
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  toggleStrategy: async (id, enabled) => {
    try {
      await gatewayRpc("strategies.toggle", { id, enabled });
      await get().fetchStrategies();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  selectStrategy: (id) => set({ selectedStrategyId: id, backtestResult: null }),

  runBacktest: async (strategyId, config) => {
    set({ backtestRunning: true, backtestResult: null, error: null });
    try {
      const res = await gatewayRpc("backtest.run", {
        strategyId,
        symbol: config?.symbol,
        days: config?.days ?? 365,
        initialCapitalUsd: config?.initialCapitalUsd ?? 10000,
        dataSource: config?.dataSource,
      });
      if (res.ok) {
        set({ backtestResult: res.payload as BacktestResult });
      } else {
        set({ error: "Backtest failed" });
      }
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ backtestRunning: false });
    }
  },

  clearBacktest: () => set({ backtestResult: null }),

  setDemoMode: (enabled) =>
    set({
      demoMode: enabled,
      strategies: enabled ? DEMO_STRATEGIES : [],
      executions: enabled ? DEMO_EXECUTIONS : [],
      selectedStrategyId: null,
      backtestResult: null,
    }),
}));
