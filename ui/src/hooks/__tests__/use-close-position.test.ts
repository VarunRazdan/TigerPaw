import { describe, expect, it } from "vitest";
import { buildCloseArgs, CLOSE_TOOL_MAP } from "../use-close-position";

describe("buildCloseArgs", () => {
  it("maps polymarket to marketId", () => {
    const args = buildCloseArgs({ extensionId: "polymarket", symbol: "MKT-123" });
    expect(args).toEqual({ marketId: "MKT-123" });
  });

  it("maps polymarket with optional quantity", () => {
    const args = buildCloseArgs({ extensionId: "polymarket", symbol: "MKT-123", quantity: 5 });
    expect(args).toEqual({ marketId: "MKT-123", quantity: 5 });
  });

  it("maps kalshi to ticker/count", () => {
    const args = buildCloseArgs({ extensionId: "kalshi", symbol: "INXD-26MAR" });
    expect(args).toEqual({ ticker: "INXD-26MAR" });
  });

  it("maps kalshi with optional quantity as count", () => {
    const args = buildCloseArgs({ extensionId: "kalshi", symbol: "INXD-26MAR", quantity: 3 });
    expect(args).toEqual({ ticker: "INXD-26MAR", count: 3 });
  });

  it("maps manifold to contractId/outcome", () => {
    const args = buildCloseArgs({ extensionId: "manifold", symbol: "abc123" });
    expect(args).toEqual({ contractId: "abc123", outcome: "YES" });
  });

  it("maps manifold with optional quantity as shares", () => {
    const args = buildCloseArgs({ extensionId: "manifold", symbol: "abc123", quantity: 10 });
    expect(args).toEqual({ contractId: "abc123", outcome: "YES", shares: 10 });
  });

  it("maps kraken to pair", () => {
    const args = buildCloseArgs({ extensionId: "kraken", symbol: "XBTUSD" });
    expect(args).toEqual({ pair: "XBTUSD" });
  });

  it("maps kraken with optional quantity", () => {
    const args = buildCloseArgs({ extensionId: "kraken", symbol: "XBTUSD", quantity: 2 });
    expect(args).toEqual({ pair: "XBTUSD", quantity: 2 });
  });

  it("maps default platforms to symbol/qty", () => {
    const args = buildCloseArgs({ extensionId: "alpaca", symbol: "AAPL" });
    expect(args).toEqual({ symbol: "AAPL" });
  });

  it("maps default platforms with optional quantity as qty", () => {
    const args = buildCloseArgs({ extensionId: "alpaca", symbol: "AAPL", quantity: 50 });
    expect(args).toEqual({ symbol: "AAPL", qty: 50 });
  });
});

describe("CLOSE_TOOL_MAP", () => {
  it("contains all 9 platforms", () => {
    expect(Object.keys(CLOSE_TOOL_MAP)).toHaveLength(9);
  });

  it("maps every platform to a close/sell tool name", () => {
    const expected: Record<string, string> = {
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
    expect(CLOSE_TOOL_MAP).toEqual(expected);
  });
});
