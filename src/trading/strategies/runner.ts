import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { loadPolicyState } from "../policy-state.js";
import { evaluateSignals, type MarketSnapshot } from "./signals.js";
import {
  getStrategy,
  recordExecution,
  updateStrategyPerformance,
} from "./registry.js";
import type {
  StrategyDefinition,
  StrategyExecution,
  PositionSizing,
} from "./types.js";

const log = createSubsystemLogger("trading/strategy-runner");

export type RunnerDependencies = {
  /** Submit a trade order and return the result. */
  submitOrder: (params: {
    extensionId: string;
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    orderType: string;
    limitPrice?: number;
  }) => Promise<{ orderId?: string; outcome: string; error?: string }>;

  /** Get current market snapshot for a symbol. */
  getMarketData: (
    symbol: string,
    extensionId: string,
  ) => Promise<MarketSnapshot>;
};

/** Calculate position size in USD. */
function calculatePositionSize(
  sizing: PositionSizing,
  portfolioValueUsd: number,
  signalStrength: number,
): number {
  let base: number;
  switch (sizing.method) {
    case "fixed_usd":
      base = sizing.fixedUsd ?? 100;
      break;
    case "percent_portfolio":
      base = portfolioValueUsd * ((sizing.percentPortfolio ?? 5) / 100);
      break;
    case "kelly": {
      // Simplified Kelly: fraction = signalStrength * (percent / 100)
      const pct = sizing.percentPortfolio ?? 10;
      base = portfolioValueUsd * ((signalStrength * pct) / 100);
      break;
    }
    case "risk_parity":
      base = portfolioValueUsd * ((sizing.percentPortfolio ?? 5) / 100);
      break;
    default:
      base = sizing.fixedUsd ?? 100;
  }

  // Enforce max concentration
  const maxUsd = portfolioValueUsd * (sizing.maxPositionPercent / 100);
  return Math.min(base, maxUsd);
}

/** Execute a strategy once against current market conditions. */
export async function executeStrategy(
  strategyId: string,
  deps: RunnerDependencies,
): Promise<StrategyExecution> {
  const strategy = await getStrategy(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  if (!strategy.enabled) {
    throw new Error(`Strategy is disabled: ${strategyId}`);
  }

  const execution: StrategyExecution = {
    id: randomUUID(),
    strategyId,
    startedAt: new Date().toISOString(),
    status: "running",
    signalResults: [],
    ordersSubmitted: 0,
    pnlUsd: 0,
  };

  try {
    const policyState = await loadPolicyState();

    // Check per-strategy risk controls
    if (
      strategy.maxDailyLossUsd != null &&
      policyState.dailyPnlUsd <= -strategy.maxDailyLossUsd
    ) {
      execution.status = "stopped";
      execution.error = `Daily loss limit reached: $${Math.abs(policyState.dailyPnlUsd).toFixed(2)} >= $${strategy.maxDailyLossUsd}`;
      execution.completedAt = new Date().toISOString();
      await recordExecution(execution);
      return execution;
    }

    if (
      strategy.killOnConsecutiveLosses != null &&
      policyState.consecutiveLosses >= strategy.killOnConsecutiveLosses
    ) {
      execution.status = "stopped";
      execution.error = `Consecutive loss limit: ${policyState.consecutiveLosses} >= ${strategy.killOnConsecutiveLosses}`;
      execution.completedAt = new Date().toISOString();
      await recordExecution(execution);
      return execution;
    }

    let totalOrdersSubmitted = 0;

    for (const symbol of strategy.symbols) {
      // Check concurrent position limit
      if (strategy.maxConcurrentPositions != null) {
        const openPositions = Object.keys(
          policyState.positionsByAsset ?? {},
        ).length;
        if (openPositions >= strategy.maxConcurrentPositions) {
          log.info(
            `max concurrent positions reached (${openPositions}/${strategy.maxConcurrentPositions}), skipping ${symbol}`,
          );
          continue;
        }
      }

      const market = await deps.getMarketData(symbol, strategy.extensionId);
      const { results, aggregateStrength } = evaluateSignals(
        strategy.signals,
        market,
      );
      execution.signalResults.push(...results);

      if (aggregateStrength < strategy.entryRule.minSignalStrength) {
        log.info(
          `signal too weak for ${symbol}: ${aggregateStrength.toFixed(3)} < ${strategy.entryRule.minSignalStrength}`,
        );
        continue;
      }

      // Determine order parameters
      const sizeUsd = calculatePositionSize(
        strategy.positionSizing,
        policyState.currentPortfolioValueUsd,
        aggregateStrength,
      );

      if (sizeUsd <= 0 || market.currentPrice <= 0) continue;

      const quantity = sizeUsd / market.currentPrice;
      const side: "buy" | "sell" = aggregateStrength >= 0.5 ? "buy" : "sell";

      let limitPrice: number | undefined;
      if (
        strategy.entryRule.orderType === "limit" &&
        strategy.entryRule.limitOffsetPercent != null
      ) {
        const offset =
          market.currentPrice * (strategy.entryRule.limitOffsetPercent / 100);
        limitPrice =
          side === "buy"
            ? market.currentPrice - offset
            : market.currentPrice + offset;
      }

      const result = await deps.submitOrder({
        extensionId: strategy.extensionId,
        symbol,
        side,
        quantity,
        orderType: strategy.entryRule.orderType,
        limitPrice,
      });

      totalOrdersSubmitted++;
      log.info(
        `order submitted for ${symbol}: ${result.outcome} (${result.orderId ?? "no-id"})`,
      );
    }

    execution.ordersSubmitted = totalOrdersSubmitted;
    execution.status = "completed";
    execution.completedAt = new Date().toISOString();

    // Update strategy performance tracking
    const strat = await getStrategy(strategyId);
    if (strat) {
      await updateStrategyPerformance(strategyId, {
        totalTrades: strat.totalTrades + totalOrdersSubmitted,
        winRate: strat.winRate, // Updated asynchronously on fills
        totalPnlUsd: strat.totalPnlUsd,
        lastExecutedAt: execution.completedAt,
      });
    }
  } catch (err) {
    execution.status = "error";
    execution.error = String(err);
    execution.completedAt = new Date().toISOString();
    log.error(`strategy execution failed: ${err}`);
  }

  await recordExecution(execution);
  return execution;
}
