import { useState, useCallback } from "react";
import { invokeToolHttp } from "@/lib/gateway-http";
import { parseToolResult, type OrderStatus } from "./use-submit-order";

/** Maps extensionId to the close-position tool registered by that extension. */
const CLOSE_TOOL_MAP: Record<string, string> = {
  alpaca: "alpaca_close_position",
  polymarket: "polymarket_close_position",
  kalshi: "kalshi_close_position",
  manifold: "manifold_sell_shares",
  coinbase: "coinbase_close_position",
  ibkr: "ibkr_close_position",
  binance: "binance_close_position",
  kraken: "kraken_close_position",
  dydx: "dydx_close_position",
};

export type ClosePositionParams = {
  extensionId: string;
  symbol: string;
  quantity?: number;
};

/**
 * Maps generic close params to extension-specific tool parameters.
 */
function buildCloseArgs(params: ClosePositionParams): Record<string, unknown> {
  const { extensionId, symbol, quantity } = params;

  switch (extensionId) {
    case "polymarket":
      return { marketId: symbol, ...(quantity !== undefined ? { quantity } : {}) };

    case "kalshi":
      return { ticker: symbol, ...(quantity !== undefined ? { count: quantity } : {}) };

    case "manifold":
      return {
        contractId: symbol,
        outcome: "YES",
        ...(quantity !== undefined ? { shares: quantity } : {}),
      };

    case "kraken":
      return { pair: symbol, ...(quantity !== undefined ? { quantity } : {}) };

    // alpaca, coinbase, ibkr, binance, dydx
    default:
      return { symbol, ...(quantity !== undefined ? { qty: quantity } : {}) };
  }
}

export function useClosePosition(): {
  state: OrderStatus;
  close: (params: ClosePositionParams) => Promise<OrderStatus>;
  reset: () => void;
} {
  const [state, setState] = useState<OrderStatus>({ status: "idle" });

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const close = useCallback(async (params: ClosePositionParams): Promise<OrderStatus> => {
    const toolName = CLOSE_TOOL_MAP[params.extensionId];
    if (!toolName) {
      const s: OrderStatus = {
        status: "error",
        message: `Unknown platform: ${params.extensionId}`,
      };
      setState(s);
      return s;
    }

    setState({ status: "submitting" });

    const args = buildCloseArgs(params);
    const result = await invokeToolHttp(toolName, args);

    if (!result.ok) {
      let s: OrderStatus;
      if (result.errorType === "not_found") {
        s = {
          status: "error",
          message: `Tool ${toolName} not available. Is the ${params.extensionId} extension enabled?`,
        };
      } else if (result.errorType === "tool_call_blocked") {
        s = { status: "denied", reason: result.error };
      } else {
        s = { status: "error", message: result.error };
      }
      setState(s);
      return s;
    }

    const parsed = parseToolResult(result.result);
    // Map "submitted" success to "closed" wording
    if (parsed.status === "success") {
      const s: OrderStatus = { status: "success", message: "Position closed successfully" };
      setState(s);
      return s;
    }
    setState(parsed);
    return parsed;
  }, []);

  return { state, close, reset };
}
