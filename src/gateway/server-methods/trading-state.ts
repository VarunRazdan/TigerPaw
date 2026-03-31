/**
 * RPC methods: trading.getState, trading.killSwitch.toggle,
 * trading.killSwitch.platform, trading.recordFill
 *
 * Provides real-time trading state from policy-state.json,
 * exposes kill switch control and fill recording to the UI / extensions.
 */
import { ErrorCodes, errorShape } from "../protocol/index.js";
import {
  validateTradingNumeric,
  MAX_QUANTITY,
  MAX_PRICE_USD,
  MAX_NOTIONAL_USD,
  MIN_QUANTITY,
} from "../../trading/numeric-bounds.js";
import type { GatewayRequestHandlers } from "./types.js";

export const tradingStateHandlers: GatewayRequestHandlers = {
  "trading.getState": async ({ respond }) => {
    try {
      const { loadPolicyState } = await import("../../trading/policy-state.js");
      const state = await loadPolicyState();
      respond(
        true,
        {
          dailyPnlUsd: state.dailyPnlUsd,
          dailySpendUsd: state.dailySpendUsd,
          dailyTradeCount: state.dailyTradeCount,
          consecutiveLosses: state.consecutiveLosses,
          highWaterMarkUsd: state.highWaterMarkUsd,
          currentPortfolioValueUsd: state.currentPortfolioValueUsd,
          killSwitch: state.killSwitch,
          platformKillSwitches: state.platformKillSwitches,
          positionsByAsset: state.positionsByAsset,
          openPositionCount: state.openPositionCount,
          date: state.date,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "trading.killSwitch.toggle": async ({ params, respond }) => {
    try {
      const active = params.active as boolean;
      const reason = (params.reason as string | undefined) ?? "Toggled via UI";
      const mode = (params.mode as "hard" | "soft" | undefined) ?? "hard";

      if (active) {
        const { activateKillSwitch } = await import("../../trading/kill-switch.js");
        await activateKillSwitch(reason, "operator", mode);
      } else {
        const { deactivateKillSwitch } = await import("../../trading/kill-switch.js");
        await deactivateKillSwitch("operator");
      }

      respond(true, { active, mode }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "trading.killSwitch.platform": async ({ params, respond }) => {
    try {
      const extensionId = params.extensionId as string;
      const active = params.active as boolean;
      const reason = (params.reason as string | undefined) ?? "Toggled via UI";

      if (!extensionId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "extensionId is required"),
        );
        return;
      }

      if (active) {
        const { activatePlatformKillSwitch } = await import("../../trading/kill-switch.js");
        await activatePlatformKillSwitch(extensionId, reason, "operator");
      } else {
        const { deactivatePlatformKillSwitch } = await import("../../trading/kill-switch.js");
        await deactivatePlatformKillSwitch(extensionId, "operator");
      }

      respond(true, { extensionId, active }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "trading.getQuote": async ({ params, respond }) => {
    try {
      const symbol = params.symbol as string;
      const extensionId = params.extensionId as string;

      if (!symbol || !extensionId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "symbol and extensionId are required"),
        );
        return;
      }

      // Return a minimal quote — extensions will override this via plugin tools
      // when available. This provides a baseline so the runner doesn't fail.
      respond(true, { symbol, extensionId, currentPrice: 0, source: "none" }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "trading.recordFill": async ({ params, respond }) => {
    try {
      const extensionId = params.extensionId as string;
      const symbol = params.symbol as string;
      const side = params.side as "buy" | "sell";
      const quantity = Number(params.quantity ?? 0);
      const executedPrice = Number(params.executedPrice ?? 0);
      const realizedPnl = Number(params.realizedPnl ?? 0);
      const orderId = params.orderId as string | undefined;

      if (!extensionId || !symbol || !side || quantity <= 0 || executedPrice < 0) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "extensionId, symbol, side, quantity > 0, and executedPrice >= 0 are required",
          ),
        );
        return;
      }

      // Bounds validation — prevent unreasonable values
      validateTradingNumeric("quantity", quantity, MIN_QUANTITY, MAX_QUANTITY);
      validateTradingNumeric("executedPrice", executedPrice, 0, MAX_PRICE_USD);
      validateTradingNumeric("realizedPnl", realizedPnl, -MAX_NOTIONAL_USD, MAX_NOTIONAL_USD);

      const { recordTradeFill } = await import("../../trading/realized-pnl.js");
      const updated = await recordTradeFill({
        extensionId,
        symbol,
        side,
        quantity,
        executedPrice,
        realizedPnl,
        orderId,
      });

      respond(
        true,
        {
          dailyPnlUsd: updated.dailyPnlUsd,
          consecutiveLosses: updated.consecutiveLosses,
          dailyTradeCount: updated.dailyTradeCount,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
