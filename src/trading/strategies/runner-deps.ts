/**
 * Factory for RunnerDependencies — bridges the strategy runner
 * to the gateway's trading infrastructure.
 */
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { RunnerDependencies } from "./runner.js";
import type { MarketSnapshot } from "./signals.js";

const log = createSubsystemLogger("trading/strategy-runner-deps");

type GatewayRpcFn = (
  method: string,
  params: Record<string, unknown>,
) => Promise<{ ok: boolean; payload?: Record<string, unknown>; error?: string }>;

/**
 * Build RunnerDependencies from a gateway RPC function.
 *
 * - submitOrder: records the fill via trading.recordFill and writes audit entry
 * - getMarketData: attempts to get a quote via trading.getQuote, falls back to
 *   a synthetic snapshot if the method is unavailable
 */
export function buildRunnerDeps(gatewayRpc: GatewayRpcFn): RunnerDependencies {
  return {
    async submitOrder(params) {
      const { extensionId, symbol, side, quantity, orderType: _orderType, limitPrice } = params;

      log.info(`submitOrder: ${side} ${quantity} ${symbol} via ${extensionId}`);

      // Record the fill via the gateway (policy checks are done by the runner itself)
      const result = await gatewayRpc("trading.recordFill", {
        extensionId,
        symbol,
        side,
        quantity,
        executedPrice: limitPrice ?? 0, // Market orders get price later
        realizedPnl: 0, // P&L is calculated on close
        orderId: `strategy-${Date.now()}`,
      });

      if (!result.ok) {
        return {
          outcome: "error",
          error: result.error ?? "recordFill failed",
        };
      }

      return {
        orderId: `strategy-${Date.now()}`,
        outcome: "submitted",
      };
    },

    async getMarketData(symbol, extensionId): Promise<MarketSnapshot> {
      // Try to get a live quote via gateway RPC
      const result = await gatewayRpc("trading.getQuote", {
        symbol,
        extensionId,
      });

      if (result.ok && result.payload) {
        const p = result.payload;
        const price = Number(p.currentPrice ?? p.price ?? p.ask ?? 0);
        return {
          symbol,
          currentPrice: price,
          previousClose: p.previousClose as number | undefined,
          high24h: p.high24h as number | undefined,
          low24h: p.low24h as number | undefined,
          volume24h: p.volume24h as number | undefined,
          priceHistory: [price],
        };
      }

      // Fallback: return a minimal snapshot so the runner can still evaluate
      // (signal evaluators degrade gracefully with minimal data)
      log.warn(`getMarketData fallback for ${symbol}: ${result.error ?? "no quote available"}`);
      return {
        symbol,
        currentPrice: 0,
        priceHistory: [],
      };
    },
  };
}
