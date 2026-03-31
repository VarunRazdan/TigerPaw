import { useState, useCallback, useRef } from "react";
import { invokeToolHttp } from "@/lib/gateway-http";
import { retryToolInvoke, INITIAL_RETRY_STATE, type RetryState } from "@/lib/retry";
import { useAppStore } from "@/stores/app-store";
import { parseToolResult, type OrderStatus } from "./use-submit-order";

/** Maps extensionId to the close-position tool registered by that extension. */
export const CLOSE_TOOL_MAP: Record<string, string> = {
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
export function buildCloseArgs(params: ClosePositionParams): Record<string, unknown> {
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
  retryState: RetryState;
  close: (params: ClosePositionParams) => Promise<OrderStatus>;
  retry: () => Promise<OrderStatus>;
  reset: () => void;
} {
  const [state, setState] = useState<OrderStatus>({ status: "idle" });
  const [retryState, setRetryState] = useState<RetryState>(INITIAL_RETRY_STATE);
  const lastParams = useRef<ClosePositionParams | null>(null);

  const reset = useCallback(() => {
    setState({ status: "idle" });
    setRetryState(INITIAL_RETRY_STATE);
  }, []);

  const close = useCallback(async (params: ClosePositionParams): Promise<OrderStatus> => {
    lastParams.current = params;

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
    const token = (useAppStore.getState() as Record<string, unknown>).token as string | undefined;
    const { result, attempts } = await retryToolInvoke(
      () => invokeToolHttp(toolName, args, { token }),
      undefined,
      (attempt, _error) => {
        setRetryState({ attempt, maxAttempts: 3, retrying: true });
      },
    );
    setRetryState({ attempt: attempts, maxAttempts: 3, retrying: false });

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

  const retry = useCallback(async (): Promise<OrderStatus> => {
    if (!lastParams.current) {
      return { status: "idle" };
    }
    return close(lastParams.current);
  }, [close]);

  return { state, retryState, close, retry, reset };
}
