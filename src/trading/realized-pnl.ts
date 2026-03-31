/**
 * Realized P&L tracking.
 *
 * Called by extensions (or the `trading.recordFill` RPC) when an order fills.
 * Updates the policy state with realized P&L, adjusts consecutive-loss counter,
 * and emits a `trading.order.filled` event so the UI updates in real time.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitTradingEvent } from "./event-emitter.js";
import type { TradingEventPayload } from "./events.js";
import { updatePolicyState, type TradingPolicyState } from "./policy-state.js";

const log = createSubsystemLogger("trading/realized-pnl");

export type FillRecord = {
  /** Extension that executed the trade. */
  extensionId: string;
  /** Instrument symbol. */
  symbol: string;
  /** Trade side. */
  side: "buy" | "sell";
  /** Filled quantity. */
  quantity: number;
  /** Executed price per unit in USD. */
  executedPrice: number;
  /** Realized P&L from this fill in USD.
   *  Positive = profit, negative = loss.
   *  For buys this is typically 0 (opening a position).
   *  For sells this is (executedPrice - entryPrice) * quantity.
   *  Callers may pass 0 for opening trades.
   */
  realizedPnl: number;
  /** Optional order ID for correlation. */
  orderId?: string;
};

/**
 * Record a trade fill: update policy state metrics and emit event.
 *
 * Returns the updated policy state.
 */
export async function recordTradeFill(fill: FillRecord): Promise<TradingPolicyState> {
  const { extensionId, symbol, side, quantity, executedPrice, realizedPnl, orderId } = fill;
  const notionalUsd = quantity * executedPrice;

  log.info(
    `fill: ${side} ${quantity} ${symbol} @ $${executedPrice.toFixed(2)} via ${extensionId}` +
      ` | realized P&L: $${realizedPnl.toFixed(2)}`,
  );

  const updated = await updatePolicyState((state) => {
    const newDailyPnl = state.dailyPnlUsd + realizedPnl;

    // Update consecutive losses: reset on profit, increment on loss, unchanged if zero
    let newConsecutiveLosses = state.consecutiveLosses;
    if (realizedPnl < 0) {
      newConsecutiveLosses += 1;
    } else if (realizedPnl > 0) {
      newConsecutiveLosses = 0;
    }
    // realizedPnl === 0 (opening trades, break-even) -- don't change counter

    // Update daily spend (only count buy-side notional)
    const newDailySpend = side === "buy" ? state.dailySpendUsd + notionalUsd : state.dailySpendUsd;

    return {
      ...state,
      dailyPnlUsd: newDailyPnl,
      dailySpendUsd: newDailySpend,
      dailyTradeCount: state.dailyTradeCount + 1,
      consecutiveLosses: newConsecutiveLosses,
      lastTradeAtMs: Date.now(),
      // Update high-water mark if portfolio value rose
      highWaterMarkUsd: Math.max(
        state.highWaterMarkUsd,
        state.currentPortfolioValueUsd + realizedPnl,
      ),
    };
  });

  // Emit event for real-time UI updates via WebSocket
  const payload: TradingEventPayload = {
    orderId,
    extensionId,
    symbol,
    side,
    notionalUsd,
  };

  emitTradingEvent({
    type: "trading.order.filled",
    timestamp: Date.now(),
    payload,
  });

  return updated;
}
