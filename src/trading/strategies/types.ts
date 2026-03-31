/** Signal types available for strategy configuration. */
export type SignalType =
  | "price_above"
  | "price_below"
  | "price_cross_above"
  | "price_cross_below"
  | "momentum"
  | "mean_reversion"
  | "rsi_overbought"
  | "rsi_oversold"
  | "volatility_breakout"
  | "custom_expression";

export type SignalConfig = {
  id: string;
  type: SignalType;
  /** Signal-specific parameters (e.g., { threshold: 70, period: 14 } for RSI). */
  params: Record<string, number | string | boolean>;
  /** Importance weight relative to other signals (0–1). */
  weight: number;
};

export type EntryRule = {
  /** Minimum combined signal strength (0–1) to trigger entry. */
  minSignalStrength: number;
  /** Order type for entry. */
  orderType: "market" | "limit";
  /** Offset from current price for limit orders (percent). */
  limitOffsetPercent?: number;
};

export type ExitRule = {
  stopLossPercent?: number;
  takeProfitPercent?: number;
  trailingStopPercent?: number;
  /** Max time to hold a position (ms). Null = indefinite. */
  maxHoldMs?: number;
};

export type PositionSizingMethod =
  | "fixed_usd"
  | "percent_portfolio"
  | "kelly"
  | "risk_parity";

export type PositionSizing = {
  method: PositionSizingMethod;
  fixedUsd?: number;
  percentPortfolio?: number;
  /** Max concentration in any single position (percent of portfolio). */
  maxPositionPercent: number;
};

export type StrategyDefinition = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  // Target
  symbols: string[];
  extensionId: string;
  // Logic
  signals: SignalConfig[];
  entryRule: EntryRule;
  exitRule: ExitRule;
  positionSizing: PositionSizing;
  // Schedule
  schedule: "continuous" | "interval";
  intervalMs?: number;
  // Per-strategy risk controls
  maxDailyLossUsd?: number;
  maxConcurrentPositions?: number;
  killOnConsecutiveLosses?: number;
  // Performance tracking
  lastExecutedAt?: string;
  totalTrades: number;
  winRate: number;
  totalPnlUsd: number;
};

export type StrategyExecutionStatus =
  | "running"
  | "completed"
  | "error"
  | "stopped";

export type SignalResult = {
  signalId: string;
  type: SignalType;
  value: number; // 0–1 strength
  triggered: boolean;
};

export type StrategyExecution = {
  id: string;
  strategyId: string;
  startedAt: string;
  completedAt?: string;
  status: StrategyExecutionStatus;
  signalResults: SignalResult[];
  ordersSubmitted: number;
  pnlUsd: number;
  error?: string;
};
