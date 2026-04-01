import type { SignalConfig, SignalResult } from "./types.js";

// Type for market data snapshot passed to signal evaluators
export type MarketSnapshot = {
  symbol: string;
  currentPrice: number;
  previousClose?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  /** Recent price history (newest first). */
  priceHistory: number[];
};

type SignalEvaluator = (config: SignalConfig, market: MarketSnapshot) => number;

// helpers
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function sma(values: number[], period: number): number {
  const slice = values.slice(0, period);
  if (slice.length === 0) {
    return 0;
  }
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function rsi(prices: number[], period: number): number {
  if (prices.length < period + 1) {
    return 50;
  } // neutral
  let gains = 0,
    losses = 0;
  for (let i = 0; i < period; i++) {
    const diff = prices[i] - prices[i + 1]; // newest first
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }
  if (losses === 0) {
    return 100;
  }
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

// --- evaluators ---

const priceAbove: SignalEvaluator = (config, market) => {
  const threshold = Number(config.params.threshold ?? 0);
  return market.currentPrice > threshold ? 1 : 0;
};

const priceBelow: SignalEvaluator = (config, market) => {
  const threshold = Number(config.params.threshold ?? Infinity);
  return market.currentPrice < threshold ? 1 : 0;
};

const priceCrossAbove: SignalEvaluator = (config, market) => {
  const threshold = Number(config.params.threshold ?? 0);
  const prev = market.previousClose ?? market.priceHistory[1] ?? market.currentPrice;
  return prev <= threshold && market.currentPrice > threshold ? 1 : 0;
};

const priceCrossBelow: SignalEvaluator = (config, market) => {
  const threshold = Number(config.params.threshold ?? Infinity);
  const prev = market.previousClose ?? market.priceHistory[1] ?? market.currentPrice;
  return prev >= threshold && market.currentPrice < threshold ? 1 : 0;
};

const momentum: SignalEvaluator = (config, market) => {
  const period = Number(config.params.period ?? 14);
  const prices = market.priceHistory;
  if (prices.length < period) {
    return 0.5;
  }
  const current = prices[0];
  const past = prices[Math.min(period - 1, prices.length - 1)];
  if (past === 0) {
    return 0.5;
  }
  const change = (current - past) / past;
  return clamp01(0.5 + change * 5); // scale +-10% -> 0-1
};

const meanReversion: SignalEvaluator = (config, market) => {
  const period = Number(config.params.period ?? 20);
  const mean = sma(market.priceHistory, period);
  if (mean === 0) {
    return 0.5;
  }
  const deviation = (market.currentPrice - mean) / mean;
  // Strong signal when price deviates significantly from mean
  return clamp01(0.5 - deviation * 5); // inverted: below mean = high signal
};

const rsiOverbought: SignalEvaluator = (config, market) => {
  const period = Number(config.params.period ?? 14);
  const threshold = Number(config.params.threshold ?? 70);
  const val = rsi(market.priceHistory, period);
  return val >= threshold ? clamp01((val - threshold) / (100 - threshold)) : 0;
};

const rsiOversold: SignalEvaluator = (config, market) => {
  const period = Number(config.params.period ?? 14);
  const threshold = Number(config.params.threshold ?? 30);
  const val = rsi(market.priceHistory, period);
  return val <= threshold ? clamp01((threshold - val) / threshold) : 0;
};

const volatilityBreakout: SignalEvaluator = (config, market) => {
  const period = Number(config.params.period ?? 20);
  const multiplier = Number(config.params.multiplier ?? 2);
  const prices = market.priceHistory.slice(0, period);
  if (prices.length < 2) {
    return 0;
  }
  const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
  const variance = prices.reduce((s, v) => s + (v - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) {
    return 0;
  }
  const zScore = Math.abs(market.currentPrice - mean) / stdDev;
  return zScore >= multiplier ? clamp01((zScore - multiplier) / multiplier) : 0;
};

const customExpression: SignalEvaluator = (config, market) => {
  // Simple expression: evaluate a comparison
  const left = Number(config.params.left ?? market.currentPrice);
  const right = Number(config.params.right ?? 0);
  const op = String(config.params.operator ?? ">");
  switch (op) {
    case ">":
      return left > right ? 1 : 0;
    case "<":
      return left < right ? 1 : 0;
    case ">=":
      return left >= right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
    default:
      return 0;
  }
};

const EVALUATORS: Record<string, SignalEvaluator> = {
  price_above: priceAbove,
  price_below: priceBelow,
  price_cross_above: priceCrossAbove,
  price_cross_below: priceCrossBelow,
  momentum,
  mean_reversion: meanReversion,
  rsi_overbought: rsiOverbought,
  rsi_oversold: rsiOversold,
  volatility_breakout: volatilityBreakout,
  custom_expression: customExpression,
};

/** Evaluate a single signal against market data. */
export function evaluateSignal(config: SignalConfig, market: MarketSnapshot): SignalResult {
  const evaluator = EVALUATORS[config.type];
  const value = evaluator ? evaluator(config, market) : 0;
  return {
    signalId: config.id,
    type: config.type,
    value,
    triggered: value >= 0.5,
  };
}

/** Evaluate all signals and return weighted aggregate strength (0-1). */
export function evaluateSignals(
  signals: SignalConfig[],
  market: MarketSnapshot,
): { results: SignalResult[]; aggregateStrength: number } {
  if (signals.length === 0) {
    return { results: [], aggregateStrength: 0 };
  }

  const results = signals.map((s) => evaluateSignal(s, market));
  const totalWeight = signals.reduce((s, sig) => s + sig.weight, 0);
  if (totalWeight === 0) {
    return { results, aggregateStrength: 0 };
  }

  const weightedSum = results.reduce((sum, r, i) => sum + r.value * signals[i].weight, 0);
  return { results, aggregateStrength: weightedSum / totalWeight };
}
