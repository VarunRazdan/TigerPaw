/**
 * Shared tool-name mappings keyed by extensionId.
 * Used by order-submission hooks and the liquidation store action.
 */

export const PLACE_ORDER_TOOLS: Record<string, string> = {
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

export const CLOSE_POSITION_TOOLS: Record<string, string> = {
  alpaca: "alpaca_close_position",
  polymarket: "polymarket_close_position",
  kalshi: "kalshi_close_position",
  manifold: "manifold_close_position",
  coinbase: "coinbase_close_position",
  ibkr: "ibkr_close_position",
  binance: "binance_close_position",
  kraken: "kraken_close_position",
  dydx: "dydx_close_position",
};
