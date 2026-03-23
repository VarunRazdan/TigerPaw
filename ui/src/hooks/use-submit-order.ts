import { useState, useCallback } from "react";
import { invokeToolHttp } from "@/lib/gateway-http";

/** Maps extensionId to the tool name registered by that extension. */
const TOOL_NAME_MAP: Record<string, string> = {
  alpaca: "alpaca_place_order",
  polymarket: "polymarket_place_order",
  kalshi: "kalshi_place_order",
  manifold: "manifold_place_bet",
  coinbase: "coinbase_place_order",
  ibkr: "ibkr_place_order",
  binance: "binance_place_order",
  kraken: "kraken_place_order",
  dydx: "dydx_place_order",
};

export type OrderStatus =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "denied"; reason: string }
  | { status: "pending"; approvalMode: string }
  | { status: "error"; message: string };

export type SubmitOrderParams = {
  extensionId: string;
  symbol: string;
  side: string;
  quantity: number;
  orderType: string;
  limitPrice?: number;
  stopPrice?: number;
};

/**
 * Maps generic form values to extension-specific tool parameters.
 * Each extension has slightly different parameter naming.
 */
export function buildToolArgs(params: SubmitOrderParams): Record<string, unknown> {
  const { extensionId, symbol, side, quantity, orderType, limitPrice, stopPrice } = params;

  switch (extensionId) {
    case "polymarket":
      return {
        marketId: symbol,
        side,
        size: quantity,
        price: limitPrice ?? 0.5,
      };

    case "kalshi":
      return {
        eventTicker: symbol,
        side,
        count: quantity,
        ...(limitPrice ? { yesPrice: Math.round(limitPrice * 100) } : {}),
      };

    case "manifold":
      return {
        contractId: symbol,
        amount: quantity,
        outcome: side === "buy" ? "YES" : "NO",
      };

    // Stock-like platforms: alpaca, coinbase, ibkr, binance, kraken, dydx
    default:
      return {
        symbol,
        qty: quantity,
        side,
        type: orderType,
        ...(limitPrice ? { limit_price: limitPrice } : {}),
        ...(stopPrice ? { stop_price: stopPrice } : {}),
      };
  }
}

/**
 * Parse the tool result text to determine the outcome.
 * Extension tools return text content describing the result.
 */
export function parseToolResult(result: unknown): OrderStatus {
  // Extract text from tool result content array
  let text = "";
  if (result && typeof result === "object") {
    const r = result as { content?: Array<{ text?: string }> };
    if (Array.isArray(r.content)) {
      text = r.content
        .map((c) => c.text ?? "")
        .join("\n")
        .toLowerCase();
    }
  }
  if (!text && typeof result === "string") {
    text = result.toLowerCase();
  }

  if (text.includes("not_implemented") || text.includes("not implemented")) {
    return { status: "error", message: "Order placement not implemented for this platform" };
  }
  if (text.includes("no_policy_engine") || text.includes("policy engine not configured")) {
    return {
      status: "error",
      message: "Trading policy engine not configured. Enable trading in config.",
    };
  }
  if (text.includes("pending") || text.includes("confirmation")) {
    const mode = text.includes("manual") ? "manual" : "confirm";
    return { status: "pending", approvalMode: mode };
  }
  if (text.includes("denied") || text.includes("blocked") || text.includes("rejected")) {
    // Try to extract the reason
    const reasonMatch = text.match(/(?:reason|denied|blocked|rejected)[:\s]+([^\n.]+)/i);
    return {
      status: "denied",
      reason: reasonMatch?.[1]?.trim() ?? "Order denied by policy engine",
    };
  }
  if (
    text.includes("submitted") ||
    text.includes("accepted") ||
    text.includes("placed") ||
    text.includes("order id")
  ) {
    return { status: "success", message: "Order submitted successfully" };
  }

  // Fallback: unknown response — treat as error to avoid false positives
  return { status: "error", message: "Unrecognized tool response" };
}

export function useSubmitOrder(): {
  state: OrderStatus;
  submit: (params: SubmitOrderParams) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<OrderStatus>({ status: "idle" });

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const submit = useCallback(async (params: SubmitOrderParams) => {
    const toolName = TOOL_NAME_MAP[params.extensionId];
    if (!toolName) {
      setState({ status: "error", message: `Unknown platform: ${params.extensionId}` });
      return;
    }

    setState({ status: "submitting" });

    const args = buildToolArgs(params);
    const result = await invokeToolHttp(toolName, args);

    if (!result.ok) {
      if (result.errorType === "not_found") {
        setState({
          status: "error",
          message: `Tool ${toolName} not available. Is the ${params.extensionId} extension enabled?`,
        });
      } else if (result.errorType === "tool_call_blocked") {
        setState({ status: "denied", reason: result.error });
      } else {
        setState({ status: "error", message: result.error });
      }
      return;
    }

    const parsed = parseToolResult(result.result);
    setState(parsed);
  }, []);

  return { state, submit, reset };
}
