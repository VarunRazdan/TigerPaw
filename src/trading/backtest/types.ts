/** OHLCV bar for historical data. */
export type OHLCV = {
  timestamp: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Configuration for a backtest run. */
export type BacktestConfig = {
  strategyId: string;
  symbol: string;
  startDate: string; // ISO 8601
  endDate: string;   // ISO 8601
  initialCapitalUsd: number;
  commissionPercent: number; // e.g., 0.1 for 0.1%
  slippageBps: number;      // Basis points
};

/** A single trade executed during backtest. */
export type BacktestTrade = {
  barIndex: number;
  timestamp: number;
  side: "buy" | "sell";
  symbol: string;
  quantity: number;
  price: number;
  commission: number;
  slippage: number;
  pnlUsd: number;
  portfolioValueUsd: number;
};

/** Point on the equity curve. */
export type EquityPoint = {
  timestamp: number;
  equity: number;
};

/** Risk metrics computed from backtest results. */
export type BacktestMetrics = {
  totalReturn: number;       // Percentage
  annualizedReturn: number;  // Percentage
  sharpe: number | null;
  sortino: number | null;
  maxDrawdownPercent: number;
  maxDrawdownUsd: number;
  calmarRatio: number | null; // annualized return / max drawdown
  winRate: number;           // Percentage
  profitFactor: number | null;
  avgWin: number;            // USD
  avgLoss: number;           // USD
  totalPnl: number;          // USD
  totalTrades: number;
  tradingDays: number;
};

/** Complete backtest result. */
export type BacktestResult = {
  id: string;
  strategyId: string;
  config: BacktestConfig;
  completedAt: string;
  durationMs: number;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  dailyPnl: number[];
  metrics: BacktestMetrics;
};
