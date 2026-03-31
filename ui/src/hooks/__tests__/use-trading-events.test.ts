import { describe, expect, it, vi, beforeEach } from "vitest";
import { formatEventDescription, resolveGatewayWsUrl } from "../use-trading-events";

describe("formatEventDescription", () => {
  it("trading.order.approved includes symbol, side, notional, and extension", () => {
    const desc = formatEventDescription("trading.order.approved", {
      symbol: "AAPL",
      side: "buy",
      notionalUsd: 1500.5,
      extensionId: "alpaca",
    });
    expect(desc).toContain("AAPL");
    expect(desc).toContain("buy");
    expect(desc).toContain("$1500.50");
    expect(desc).toContain("via alpaca");
  });

  it("trading.order.approved without extension omits via", () => {
    const desc = formatEventDescription("trading.order.approved", {
      symbol: "TSLA",
      side: "sell",
      notionalUsd: 200,
    });
    expect(desc).toContain("TSLA");
    expect(desc).toContain("sell");
    expect(desc).not.toContain("via");
  });

  it("trading.order.denied uses reason when provided", () => {
    const desc = formatEventDescription("trading.order.denied", {
      symbol: "AAPL",
      side: "buy",
      reason: "Exceeds daily limit",
    });
    expect(desc).toBe("Exceeds daily limit");
  });

  it("trading.order.denied falls back when no reason", () => {
    const desc = formatEventDescription("trading.order.denied", {
      symbol: "AAPL",
      side: "buy",
    });
    expect(desc).toContain("AAPL");
    expect(desc).toContain("buy");
    expect(desc).toContain("blocked");
  });

  it("trading.order.pending includes approval mode, symbol, and side", () => {
    const desc = formatEventDescription("trading.order.pending", {
      approvalMode: "manual",
      symbol: "BTC",
      side: "buy",
      notionalUsd: 5000,
    });
    expect(desc).toContain("manual");
    expect(desc).toContain("BTC");
    expect(desc).toContain("buy");
  });

  it("trading.order.pending defaults approvalMode to manual", () => {
    const desc = formatEventDescription("trading.order.pending", {
      symbol: "ETH",
      side: "sell",
    });
    expect(desc).toContain("manual");
  });

  it("trading.order.submitted includes symbol and notional", () => {
    const desc = formatEventDescription("trading.order.submitted", {
      symbol: "GOOG",
      notionalUsd: 3000,
      extensionId: "ibkr",
    });
    expect(desc).toContain("GOOG");
    expect(desc).toContain("$3000.00");
  });

  it("trading.order.filled includes symbol, side, notional, and extension", () => {
    const desc = formatEventDescription("trading.order.filled", {
      symbol: "MSFT",
      side: "buy",
      notionalUsd: 450.99,
      extensionId: "alpaca",
    });
    expect(desc).toContain("MSFT");
    expect(desc).toContain("buy");
    expect(desc).toContain("$450.99");
    expect(desc).toContain("via alpaca");
  });

  it("trading.order.failed uses reason when provided", () => {
    const desc = formatEventDescription("trading.order.failed", {
      symbol: "NVDA",
      reason: "Insufficient funds",
    });
    expect(desc).toBe("Insufficient funds");
  });

  it("trading.order.failed falls back when no reason", () => {
    const desc = formatEventDescription("trading.order.failed", {
      symbol: "NVDA",
    });
    expect(desc).toContain("NVDA");
    expect(desc).toContain("order failed");
  });

  it("trading.killswitch.activated uses reason and extension", () => {
    const desc = formatEventDescription("trading.killswitch.activated", {
      reason: "Max drawdown reached",
      extensionId: "binance",
    });
    expect(desc).toBe("Max drawdown reached");
  });

  it("trading.killswitch.activated falls back with extension", () => {
    const desc = formatEventDescription("trading.killswitch.activated", {
      extensionId: "binance",
    });
    expect(desc).toContain("Trading halted");
    expect(desc).toContain("binance");
  });

  it("trading.killswitch.deactivated includes extension", () => {
    const desc = formatEventDescription("trading.killswitch.deactivated", {
      extensionId: "alpaca",
    });
    expect(desc).toContain("Trading resumed");
    expect(desc).toContain("alpaca");
  });

  it("trading.limit.warning includes percentage and threshold", () => {
    const desc = formatEventDescription("trading.limit.warning", {
      limitName: "Daily loss",
      currentPercent: 85,
      thresholdPercent: 90,
    });
    expect(desc).toContain("85%");
    expect(desc).toContain("90%");
    expect(desc).toContain("Daily loss");
  });

  it("trading.limit.warning falls back when no percentage data", () => {
    const desc = formatEventDescription("trading.limit.warning", {
      limitName: "Position size",
    });
    expect(desc).toContain("Position size");
    expect(desc).toContain("approaching threshold");
  });

  it("unknown event type returns fallback", () => {
    const desc = formatEventDescription("trading.unknown.type", {});
    expect(desc).toBe("Trading event");
  });

  it("handles missing optional fields gracefully", () => {
    const desc = formatEventDescription("trading.order.approved", {});
    expect(typeof desc).toBe("string");
    // All fields empty: "  " trimmed to "" — still a valid string, no crash
  });
});

describe("resolveGatewayWsUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns localhost:18789 for dev port 5173", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      port: "5173",
      protocol: "http:",
      host: "localhost:5173",
    } as Location);
    expect(resolveGatewayWsUrl()).toBe("ws://127.0.0.1:18789");
  });

  it("returns localhost:18789 for dev port 5174", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      port: "5174",
      protocol: "http:",
      host: "localhost:5174",
    } as Location);
    expect(resolveGatewayWsUrl()).toBe("ws://127.0.0.1:18789");
  });

  it("uses wss: for https protocol", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      port: "443",
      protocol: "https:",
      host: "example.com",
    } as Location);
    expect(resolveGatewayWsUrl()).toBe("wss://example.com");
  });

  it("uses ws: for http protocol", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      port: "8080",
      protocol: "http:",
      host: "example.com:8080",
    } as Location);
    expect(resolveGatewayWsUrl()).toBe("ws://example.com:8080");
  });
});
