/**
 * RPC methods: backtest.run, backtest.generate
 *
 * Runs strategy backtests against synthetic OHLCV data and returns
 * performance metrics, equity curves, and trade logs (F7).
 */
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const backtestHandlers: GatewayRequestHandlers = {
  "backtest.run": async ({ params, respond }) => {
    try {
      const strategyId = params.strategyId as string;
      const symbol = params.symbol as string | undefined;
      const days = Number(params.days ?? 365);
      const initialCapitalUsd = Number(params.initialCapitalUsd ?? 10000);
      const commissionPercent = Number(params.commissionPercent ?? 0.1);
      const slippageBps = Number(params.slippageBps ?? 5);
      const dataSource = params.dataSource as "synthetic" | "alpaca" | undefined;

      if (!strategyId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategyId is required"));
        return;
      }

      const { getStrategy } = await import("../../trading/strategies/registry.js");
      const strategy = await getStrategy(strategyId);
      if (!strategy) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategy not found"));
        return;
      }

      const backtestSymbol = symbol ?? strategy.symbols[0] ?? "DEMO";
      const { runBacktest } = await import("../../trading/backtest/engine.js");

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 86_400_000);

      // Resolve data provider (alpaca with real data, or synthetic fallback)
      const { resolveDataProvider } = await import("../../trading/backtest/resolve-provider.js");
      const provider = await resolveDataProvider(dataSource);
      let dataWarning: string | undefined;
      let providerResult;

      try {
        providerResult = await provider.fetchBars({
          symbol: backtestSymbol,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });
      } catch (err) {
        // Fallback to synthetic if real data fails
        if (dataSource === "alpaca") {
          dataWarning = `Alpaca data unavailable: ${String(err)}. Using synthetic data.`;
          const { SyntheticDataProvider } =
            await import("../../trading/backtest/synthetic-provider.js");
          const fallback = new SyntheticDataProvider();
          providerResult = await fallback.fetchBars({
            symbol: backtestSymbol,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          });
        } else {
          throw err;
        }
      }

      const result = await runBacktest(strategy, providerResult.bars, {
        strategyId,
        symbol: backtestSymbol,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        initialCapitalUsd,
        commissionPercent,
        slippageBps,
      });

      respond(
        true,
        {
          id: result.id,
          strategyId: result.strategyId,
          completedAt: result.completedAt,
          durationMs: result.durationMs,
          metrics: result.metrics,
          tradeCount: result.trades.length,
          equityCurve: result.equityCurve,
          trades: result.trades.slice(-100),
          dataSource: providerResult.source,
          dataCached: providerResult.cached,
          dataWarning,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "backtest.generate": async ({ params, respond }) => {
    try {
      const symbol = (params.symbol as string) ?? "DEMO";
      const days = Number(params.days ?? 365);
      const pattern = (params.pattern as string) ?? "random";
      const startPrice = Number(params.startPrice ?? 150);
      const seed = Number(params.seed ?? 42);

      const { generateOHLCV } = await import("../../trading/backtest/data-generator.js");

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 86_400_000);

      const bars = generateOHLCV({
        symbol,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        startPrice,
        pattern: pattern as
          | "trending_up"
          | "trending_down"
          | "mean_reverting"
          | "volatile"
          | "random",
        seed,
      });

      respond(true, { symbol, bars: bars.length, sample: bars.slice(0, 5) }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
