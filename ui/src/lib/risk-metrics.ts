/**
 * Pure risk-metric calculations from daily P&L history.
 *
 * All functions accept an array of daily P&L values (USD) and return
 * the computed metric. They are designed to be called from React
 * components via useMemo.
 */

export type RiskMetrics = {
  /** Annualized Sharpe ratio (excess return / volatility). */
  sharpe: number | null;
  /** Annualized Sortino ratio (excess return / downside deviation). */
  sortino: number | null;
  /** Maximum peak-to-trough drawdown as a percentage (0–100). */
  maxDrawdownPercent: number;
  /** Percentage of profitable days (0–100). */
  winRate: number;
  /** Gross profit / gross loss. Infinity if no losses. */
  profitFactor: number | null;
  /** Average profitable day (USD). */
  avgWin: number;
  /** Average losing day (USD, expressed as positive). */
  avgLoss: number;
  /** Total cumulative P&L (USD). */
  totalPnl: number;
  /** Number of trading days in the sample. */
  tradingDays: number;
};

/** Annualized risk-free rate (used for Sharpe/Sortino). */
const RISK_FREE_DAILY = 0.05 / 252; // ~5% annual / 252 trading days

/**
 * Compute all risk metrics from an array of daily P&L values.
 * Returns null-safe metrics (null for ratios when insufficient data).
 */
export function computeRiskMetrics(dailyPnl: number[]): RiskMetrics {
  const n = dailyPnl.length;

  if (n === 0) {
    return {
      sharpe: null,
      sortino: null,
      maxDrawdownPercent: 0,
      winRate: 0,
      profitFactor: null,
      avgWin: 0,
      avgLoss: 0,
      totalPnl: 0,
      tradingDays: 0,
    };
  }

  // ── Basic aggregates ───────────────────────────────────────────
  const totalPnl = dailyPnl.reduce((s, v) => s + v, 0);
  const meanReturn = totalPnl / n;

  const wins = dailyPnl.filter((v) => v > 0);
  const losses = dailyPnl.filter((v) => v < 0);

  const winRate = (wins.length / n) * 100;
  const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgLoss =
    losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 0;

  const grossProfit = wins.reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(losses.reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? null : null;

  // ── Sharpe ratio ───────────────────────────────────────────────
  let sharpe: number | null = null;
  if (n >= 2) {
    const variance = dailyPnl.reduce((s, v) => s + (v - meanReturn) ** 2, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      sharpe = ((meanReturn - RISK_FREE_DAILY) / stdDev) * Math.sqrt(252);
    }
  }

  // ── Sortino ratio ──────────────────────────────────────────────
  let sortino: number | null = null;
  if (n >= 2) {
    const downsideVariance =
      dailyPnl.reduce((s, v) => s + Math.min(0, v - RISK_FREE_DAILY) ** 2, 0) / (n - 1);
    const downsideDev = Math.sqrt(downsideVariance);
    if (downsideDev > 0) {
      sortino = ((meanReturn - RISK_FREE_DAILY) / downsideDev) * Math.sqrt(252);
    }
  }

  // ── Max drawdown ───────────────────────────────────────────────
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;

  for (const pnl of dailyPnl) {
    cumulative += pnl;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Express as percentage of peak (or 0 if peak is 0)
  const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

  return {
    sharpe,
    sortino,
    maxDrawdownPercent,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    totalPnl,
    tradingDays: n,
  };
}

/** Format a ratio with 2 decimal places, or "—" if null. */
export function formatRatio(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return value.toFixed(2);
}

/** Classify a Sharpe/Sortino ratio for color coding. */
export function ratioSeverity(value: number | null): "good" | "neutral" | "bad" {
  if (value == null) {
    return "neutral";
  }
  if (value >= 1.0) {
    return "good";
  }
  if (value >= 0) {
    return "neutral";
  }
  return "bad";
}
