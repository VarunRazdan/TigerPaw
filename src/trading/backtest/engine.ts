import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { MarketSnapshot } from "../strategies/signals.js";
import { evaluateSignals } from "../strategies/signals.js";
// Import strategy types — the strategy module lives at a sibling path
import type { StrategyDefinition } from "../strategies/types.js";
import type {
  OHLCV,
  BacktestConfig,
  BacktestTrade,
  BacktestResult,
  BacktestMetrics,
  EquityPoint,
} from "./types.js";

const log = createSubsystemLogger("trading/backtest");

/** Build a MarketSnapshot from OHLCV bars for signal evaluation. */
function buildSnapshot(bars: OHLCV[], currentIndex: number): MarketSnapshot {
  const current = bars[currentIndex];
  const lookback = Math.min(currentIndex + 1, 50);
  const priceHistory: number[] = [];
  for (let i = currentIndex; i >= currentIndex - lookback + 1 && i >= 0; i--) {
    priceHistory.push(bars[i].close);
  }
  return {
    symbol: "",
    currentPrice: current.close,
    previousClose: currentIndex > 0 ? bars[currentIndex - 1].close : undefined,
    high24h: current.high,
    low24h: current.low,
    volume24h: current.volume,
    priceHistory,
  };
}

/** Compute risk metrics from daily P&L array. */
function computeMetrics(
  dailyPnl: number[],
  config: BacktestConfig,
  finalEquity: number,
  equityCurve: EquityPoint[],
): BacktestMetrics {
  const n = dailyPnl.length;
  const totalPnl = dailyPnl.reduce((s, v) => s + v, 0);
  const totalReturn =
    config.initialCapitalUsd > 0
      ? ((finalEquity - config.initialCapitalUsd) / config.initialCapitalUsd) * 100
      : 0;

  // Annualized return
  const years = n / 252;
  const annualizedReturn =
    years > 0 ? ((finalEquity / config.initialCapitalUsd) ** (1 / years) - 1) * 100 : 0;

  const wins = dailyPnl.filter((v) => v > 0);
  const losses = dailyPnl.filter((v) => v < 0);
  const winRate = n > 0 ? (wins.length / n) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgLoss =
    losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 0;

  const grossProfit = wins.reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(losses.reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? Infinity : null;

  // Sharpe & Sortino
  const RISK_FREE_DAILY = 0.05 / 252;
  let sharpe: number | null = null;
  let sortino: number | null = null;
  if (n >= 2) {
    const mean = totalPnl / n;
    const variance = dailyPnl.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      sharpe = ((mean - RISK_FREE_DAILY) / stdDev) * Math.sqrt(252);
    }
    const downsideVar =
      dailyPnl.reduce((s, v) => s + Math.min(0, v - RISK_FREE_DAILY) ** 2, 0) / (n - 1);
    const downsideDev = Math.sqrt(downsideVar);
    if (downsideDev > 0) {
      sortino = ((mean - RISK_FREE_DAILY) / downsideDev) * Math.sqrt(252);
    }
  }

  // Max drawdown
  let peak = config.initialCapitalUsd;
  let maxDdUsd = 0;
  let maxDdPct = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) {
      peak = pt.equity;
    }
    const dd = peak - pt.equity;
    if (dd > maxDdUsd) {
      maxDdUsd = dd;
    }
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (ddPct > maxDdPct) {
      maxDdPct = ddPct;
    }
  }

  const calmarRatio = maxDdPct > 0 ? annualizedReturn / maxDdPct : null;

  return {
    totalReturn,
    annualizedReturn,
    sharpe,
    sortino,
    maxDrawdownPercent: maxDdPct,
    maxDrawdownUsd: maxDdUsd,
    calmarRatio,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    totalPnl,
    totalTrades: 0, // set by caller
    tradingDays: n,
  };
}

/**
 * Run a backtest: simulate strategy execution over historical OHLCV bars.
 *
 * The engine iterates bar-by-bar, evaluates signals, and simulates
 * market/limit order fills with configurable commission and slippage.
 */
export async function runBacktest(
  strategy: StrategyDefinition,
  bars: OHLCV[],
  config: BacktestConfig,
): Promise<BacktestResult> {
  const startMs = Date.now();
  log.info(
    `backtest start: strategy="${strategy.name}" symbol=${config.symbol} bars=${bars.length}`,
  );

  let cash = config.initialCapitalUsd;
  let positionQty = 0;
  let positionAvgPrice = 0;
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const dailyPnlMap = new Map<string, number>(); // date string → pnl

  // We need at least some lookback bars for signals
  const warmupBars = 30;

  for (let i = warmupBars; i < bars.length; i++) {
    const bar = bars[i];
    const snapshot = buildSnapshot(bars, i);
    snapshot.symbol = config.symbol;

    const portfolioValue = cash + positionQty * bar.close;
    equityCurve.push({ timestamp: bar.timestamp, equity: portfolioValue });

    // Track daily P&L
    const dateKey = new Date(bar.timestamp).toISOString().slice(0, 10);
    const prevEquity =
      i > warmupBars
        ? (equityCurve[equityCurve.length - 2]?.equity ?? config.initialCapitalUsd)
        : config.initialCapitalUsd;
    const dayPnl = portfolioValue - prevEquity;
    dailyPnlMap.set(dateKey, (dailyPnlMap.get(dateKey) ?? 0) + dayPnl);

    // Check exit conditions for existing position
    if (positionQty > 0) {
      let shouldExit = false;
      let exitReason = "";

      if (strategy.exitRule.stopLossPercent != null) {
        const slPct = ((positionAvgPrice - bar.low) / positionAvgPrice) * 100;
        if (slPct >= strategy.exitRule.stopLossPercent) {
          shouldExit = true;
          exitReason = "stop_loss";
        }
      }

      if (!shouldExit && strategy.exitRule.takeProfitPercent != null) {
        const tpPct = ((bar.high - positionAvgPrice) / positionAvgPrice) * 100;
        if (tpPct >= strategy.exitRule.takeProfitPercent) {
          shouldExit = true;
          exitReason = "take_profit";
        }
      }

      if (shouldExit) {
        const exitPrice =
          exitReason === "stop_loss"
            ? positionAvgPrice * (1 - strategy.exitRule.stopLossPercent! / 100)
            : positionAvgPrice * (1 + strategy.exitRule.takeProfitPercent! / 100);

        const slippageRate = config.slippageBps / 10000;
        const fillPrice = exitPrice * (1 - slippageRate);
        const proceeds = positionQty * fillPrice;
        const commission = proceeds * (config.commissionPercent / 100);
        const pnl = proceeds - positionQty * positionAvgPrice - commission;

        trades.push({
          barIndex: i,
          timestamp: bar.timestamp,
          side: "sell",
          symbol: config.symbol,
          quantity: positionQty,
          price: fillPrice,
          commission,
          slippage: Math.abs(exitPrice - fillPrice) * positionQty,
          pnlUsd: pnl,
          portfolioValueUsd: cash + proceeds - commission,
        });

        cash += proceeds - commission;
        positionQty = 0;
        positionAvgPrice = 0;
        continue;
      }
    }

    // Evaluate entry signals (only if flat)
    if (positionQty === 0) {
      const { aggregateStrength } = evaluateSignals(strategy.signals, snapshot);

      if (aggregateStrength >= strategy.entryRule.minSignalStrength) {
        // Calculate position size
        let sizeUsd: number;
        switch (strategy.positionSizing.method) {
          case "fixed_usd":
            sizeUsd = strategy.positionSizing.fixedUsd ?? 1000;
            break;
          case "percent_portfolio":
            sizeUsd = portfolioValue * ((strategy.positionSizing.percentPortfolio ?? 5) / 100);
            break;
          case "kelly":
            sizeUsd =
              portfolioValue *
              ((aggregateStrength * (strategy.positionSizing.percentPortfolio ?? 10)) / 100);
            break;
          case "risk_parity":
          default:
            sizeUsd = portfolioValue * ((strategy.positionSizing.percentPortfolio ?? 5) / 100);
        }

        // Enforce max position concentration
        const maxUsd = portfolioValue * (strategy.positionSizing.maxPositionPercent / 100);
        sizeUsd = Math.min(sizeUsd, maxUsd, cash * 0.95); // Don't use more than 95% of cash

        if (sizeUsd > 0 && bar.close > 0) {
          const slippageRate = config.slippageBps / 10000;
          const fillPrice = bar.close * (1 + slippageRate); // Buying: price goes up
          const qty = sizeUsd / fillPrice;
          const commission = sizeUsd * (config.commissionPercent / 100);

          if (cash >= sizeUsd + commission) {
            trades.push({
              barIndex: i,
              timestamp: bar.timestamp,
              side: "buy",
              symbol: config.symbol,
              quantity: qty,
              price: fillPrice,
              commission,
              slippage: Math.abs(fillPrice - bar.close) * qty,
              pnlUsd: 0,
              portfolioValueUsd: portfolioValue,
            });

            cash -= sizeUsd + commission;
            positionQty = qty;
            positionAvgPrice = fillPrice;
          }
        }
      }
    }
  }

  // Close any remaining position at last bar
  if (positionQty > 0 && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const fillPrice = lastBar.close * (1 - config.slippageBps / 10000);
    const proceeds = positionQty * fillPrice;
    const commission = proceeds * (config.commissionPercent / 100);
    const pnl = proceeds - positionQty * positionAvgPrice - commission;

    trades.push({
      barIndex: bars.length - 1,
      timestamp: lastBar.timestamp,
      side: "sell",
      symbol: config.symbol,
      quantity: positionQty,
      price: fillPrice,
      commission,
      slippage: Math.abs(lastBar.close - fillPrice) * positionQty,
      pnlUsd: pnl,
      portfolioValueUsd: cash + proceeds - commission,
    });

    cash += proceeds - commission;
    positionQty = 0;
  }

  const dailyPnl = Array.from(dailyPnlMap.values());
  const finalEquity = cash + positionQty * (bars[bars.length - 1]?.close ?? 0);
  const metrics = computeMetrics(dailyPnl, config, finalEquity, equityCurve);
  metrics.totalTrades = trades.length;

  const durationMs = Date.now() - startMs;
  log.info(
    `backtest done: ${trades.length} trades, ${metrics.totalReturn.toFixed(1)}% return, ${durationMs}ms`,
  );

  return {
    id: randomUUID(),
    strategyId: strategy.id,
    config,
    completedAt: new Date().toISOString(),
    durationMs,
    trades,
    equityCurve,
    dailyPnl,
    metrics,
  };
}
