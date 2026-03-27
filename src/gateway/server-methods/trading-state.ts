/**
 * RPC method: trading.getState
 *
 * Returns real-time trading state from policy-state.json.
 * Only responds when trading is enabled in the config.
 */
import type { ServerMethodContext } from "./types.js";

export function registerTradingStateMethods(ctx: ServerMethodContext): void {
  ctx.rpc.addMethod("trading.getState", async () => {
    const config = ctx.config();
    if (!config?.trading?.enabled) {
      return { ok: false, error: "Trading is not enabled" };
    }

    try {
      const { loadPolicyState } = await import("../../trading/policy-state.js");
      const state = await loadPolicyState();
      return {
        ok: true,
        dailyPnlUsd: state.dailyPnlUsd,
        dailySpendUsd: state.dailySpendUsd,
        dailyTradeCount: state.dailyTradeCount,
        consecutiveLosses: state.consecutiveLosses,
        highWaterMarkUsd: state.highWaterMarkUsd,
        currentPortfolioValueUsd: state.currentPortfolioValueUsd,
        killSwitch: state.killSwitch,
        platformKillSwitches: state.platformKillSwitches,
        positionsByAsset: state.positionsByAsset,
        date: state.date,
      };
    } catch {
      return { ok: false, error: "Failed to load trading state" };
    }
  });
}
