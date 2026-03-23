import { describe, expect, it } from "vitest";
import { buildToolArgs, parseToolResult } from "../use-submit-order";

describe("buildToolArgs", () => {
  const base = {
    extensionId: "alpaca",
    symbol: "AAPL",
    side: "buy",
    quantity: 10,
    orderType: "market",
  };

  it("maps alpaca to default stock params", () => {
    const args = buildToolArgs(base);
    expect(args).toEqual({ symbol: "AAPL", qty: 10, side: "buy", type: "market" });
  });

  it("maps polymarket to marketId/side/size/price", () => {
    const args = buildToolArgs({ ...base, extensionId: "polymarket", limitPrice: 0.65 });
    expect(args).toEqual({ marketId: "AAPL", side: "buy", size: 10, price: 0.65 });
  });

  it("defaults polymarket price to 0.5 when no limitPrice", () => {
    const args = buildToolArgs({ ...base, extensionId: "polymarket" });
    expect(args.price).toBe(0.5);
  });

  it("maps kalshi to eventTicker/side/count with yesPrice in cents", () => {
    const args = buildToolArgs({
      ...base,
      extensionId: "kalshi",
      symbol: "INXD-26MAR",
      limitPrice: 0.42,
    });
    expect(args).toEqual({ eventTicker: "INXD-26MAR", side: "buy", count: 10, yesPrice: 42 });
  });

  it("maps manifold to contractId/amount/outcome", () => {
    const args = buildToolArgs({ ...base, extensionId: "manifold", symbol: "abc123" });
    expect(args).toEqual({ contractId: "abc123", amount: 10, outcome: "YES" });
  });

  it("maps manifold sell to NO outcome", () => {
    const args = buildToolArgs({ ...base, extensionId: "manifold", side: "sell" });
    expect(args.outcome).toBe("NO");
  });

  it("includes limit_price only when provided", () => {
    const without = buildToolArgs(base);
    expect(without.limit_price).toBeUndefined();
    const withIt = buildToolArgs({ ...base, limitPrice: 150 });
    expect(withIt.limit_price).toBe(150);
  });

  it("includes stop_price only when provided", () => {
    const without = buildToolArgs(base);
    expect(without.stop_price).toBeUndefined();
    const withIt = buildToolArgs({ ...base, stopPrice: 140 });
    expect(withIt.stop_price).toBe(140);
  });
});

describe("parseToolResult", () => {
  it("returns error for 'not_implemented' text", () => {
    const result = parseToolResult({ content: [{ text: "not_implemented" }] });
    expect(result.status).toBe("error");
  });

  it("returns error for 'no_policy_engine' text", () => {
    const result = parseToolResult({ content: [{ text: "no_policy_engine" }] });
    expect(result.status).toBe("error");
  });

  it("returns pending for 'confirmation' text", () => {
    const result = parseToolResult({ content: [{ text: "Awaiting confirmation from operator" }] });
    expect(result.status).toBe("pending");
  });

  it("returns denied for 'denied' text", () => {
    const result = parseToolResult({ content: [{ text: "Order denied: exceeds daily limit" }] });
    expect(result.status).toBe("denied");
  });

  it("returns denied with default reason when no reason extractable", () => {
    const result = parseToolResult({ content: [{ text: "blocked" }] });
    expect(result.status).toBe("denied");
    if (result.status === "denied") {
      expect(result.reason).toContain("policy engine");
    }
  });

  it("returns success for 'submitted' text", () => {
    const result = parseToolResult({
      content: [{ text: "Order submitted. Order ID: abc123" }],
    });
    expect(result.status).toBe("success");
  });

  it("returns success for 'accepted' text", () => {
    const result = parseToolResult("Order accepted");
    expect(result.status).toBe("success");
  });

  it("handles content array format and string format", () => {
    const fromArray = parseToolResult({ content: [{ text: "order submitted" }] });
    const fromString = parseToolResult("order submitted");
    expect(fromArray.status).toBe("success");
    expect(fromString.status).toBe("success");
  });

  it("returns error for unrecognized text (security: no false positives)", () => {
    const result = parseToolResult({ content: [{ text: "something unknown happened" }] });
    expect(result.status).toBe("error");
  });
});
