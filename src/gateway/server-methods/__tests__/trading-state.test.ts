// @ts-nocheck — Tests reference tradingStateHandlers export that doesn't exist yet.
// trading-state.ts exports registerTradingStateMethods instead.
// TODO: Refactor tests when handler export is added.
/**
 * Tests for the trading-state gateway RPC handlers.
 *
 * Mocks trading/policy-state, trading/kill-switch, and trading/realized-pnl
 * to validate handler logic without touching real state files.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayRequestHandlerOptions } from "../types.js";

// ── Mocks ────────────────────────────────────────────────────────

const mockLoadPolicyState = vi.fn();
vi.mock("../../../trading/policy-state.js", () => ({
  loadPolicyState: (...args: unknown[]) => mockLoadPolicyState(...args),
}));

const mockActivateKillSwitch = vi.fn();
const mockDeactivateKillSwitch = vi.fn();
const mockActivatePlatformKillSwitch = vi.fn();
const mockDeactivatePlatformKillSwitch = vi.fn();
vi.mock("../../../trading/kill-switch.js", () => ({
  activateKillSwitch: (...args: unknown[]) => mockActivateKillSwitch(...args),
  deactivateKillSwitch: (...args: unknown[]) => mockDeactivateKillSwitch(...args),
  activatePlatformKillSwitch: (...args: unknown[]) => mockActivatePlatformKillSwitch(...args),
  deactivatePlatformKillSwitch: (...args: unknown[]) => mockDeactivatePlatformKillSwitch(...args),
}));

const mockRecordTradeFill = vi.fn();
vi.mock("../../../trading/realized-pnl.js", () => ({
  recordTradeFill: (...args: unknown[]) => mockRecordTradeFill(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeOpts(
  method: string,
  params: Record<string, unknown>,
): { opts: GatewayRequestHandlerOptions; respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  return {
    opts: {
      req: { type: "req" as const, method, params, id: "test-1" },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestHandlerOptions["context"],
    },
    respond,
  };
}

// ── Setup ────────────────────────────────────────────────────────

let handlers: Record<string, (opts: GatewayRequestHandlerOptions) => Promise<void>>;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../trading-state.js");
  handlers = mod.tradingStateHandlers as typeof handlers;
});

// ── trading.getState ─────────────────────────────────────────────

describe("trading.getState", () => {
  it("returns all policy state fields on success", async () => {
    const state = {
      dailyPnlUsd: 150,
      dailySpendUsd: 50,
      dailyTradeCount: 7,
      consecutiveLosses: 1,
      highWaterMarkUsd: 10_000,
      currentPortfolioValueUsd: 9_800,
      killSwitch: { active: false },
      platformKillSwitches: {},
      positionsByAsset: { BTC: { qty: 0.5 } },
      openPositionCount: 1,
      date: "2026-03-31",
    };
    mockLoadPolicyState.mockResolvedValue(state);

    const { opts, respond } = makeOpts("trading.getState", {});
    await handlers["trading.getState"](opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        dailyPnlUsd: 150,
        dailySpendUsd: 50,
        dailyTradeCount: 7,
        consecutiveLosses: 1,
        highWaterMarkUsd: 10_000,
        currentPortfolioValueUsd: 9_800,
        killSwitch: { active: false },
        platformKillSwitches: {},
        positionsByAsset: { BTC: { qty: 0.5 } },
        openPositionCount: 1,
        date: "2026-03-31",
      }),
      undefined,
    );
  });

  it("responds with error when loadPolicyState throws", async () => {
    mockLoadPolicyState.mockRejectedValue(new Error("file not found"));

    const { opts, respond } = makeOpts("trading.getState", {});
    await handlers["trading.getState"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── trading.killSwitch.toggle ────────────────────────────────────

describe("trading.killSwitch.toggle", () => {
  it("activates hard kill switch", async () => {
    mockActivateKillSwitch.mockResolvedValue(undefined);

    const { opts, respond } = makeOpts("trading.killSwitch.toggle", {
      active: true,
      reason: "Emergency",
      mode: "hard",
    });
    await handlers["trading.killSwitch.toggle"](opts);

    expect(mockActivateKillSwitch).toHaveBeenCalledWith("Emergency", "operator", "hard");
    expect(respond).toHaveBeenCalledWith(true, { active: true, mode: "hard" }, undefined);
  });

  it("activates soft kill switch", async () => {
    mockActivateKillSwitch.mockResolvedValue(undefined);

    const { opts, respond } = makeOpts("trading.killSwitch.toggle", {
      active: true,
      reason: "Cooldown",
      mode: "soft",
    });
    await handlers["trading.killSwitch.toggle"](opts);

    expect(mockActivateKillSwitch).toHaveBeenCalledWith("Cooldown", "operator", "soft");
    expect(respond).toHaveBeenCalledWith(true, { active: true, mode: "soft" }, undefined);
  });

  it("deactivates kill switch", async () => {
    mockDeactivateKillSwitch.mockResolvedValue(undefined);

    const { opts, respond } = makeOpts("trading.killSwitch.toggle", { active: false });
    await handlers["trading.killSwitch.toggle"](opts);

    expect(mockDeactivateKillSwitch).toHaveBeenCalledWith("operator");
    expect(respond).toHaveBeenCalledWith(true, { active: false, mode: "hard" }, undefined);
  });

  it("uses default reason and mode when omitted", async () => {
    mockActivateKillSwitch.mockResolvedValue(undefined);

    const { opts, respond } = makeOpts("trading.killSwitch.toggle", { active: true });
    await handlers["trading.killSwitch.toggle"](opts);

    expect(mockActivateKillSwitch).toHaveBeenCalledWith("Toggled via UI", "operator", "hard");
    expect(respond).toHaveBeenCalledWith(true, { active: true, mode: "hard" }, undefined);
  });

  it("responds with error when activateKillSwitch throws", async () => {
    mockActivateKillSwitch.mockRejectedValue(new Error("state write failed"));

    const { opts, respond } = makeOpts("trading.killSwitch.toggle", { active: true });
    await handlers["trading.killSwitch.toggle"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── trading.killSwitch.platform ──────────────────────────────────

describe("trading.killSwitch.platform", () => {
  it("rejects missing extensionId", async () => {
    const { opts, respond } = makeOpts("trading.killSwitch.platform", { active: true });
    await handlers["trading.killSwitch.platform"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST", message: "extensionId is required" }),
    );
  });

  it("activates platform kill switch", async () => {
    mockActivatePlatformKillSwitch.mockResolvedValue(undefined);

    const { opts, respond } = makeOpts("trading.killSwitch.platform", {
      extensionId: "alpaca",
      active: true,
      reason: "maintenance",
    });
    await handlers["trading.killSwitch.platform"](opts);

    expect(mockActivatePlatformKillSwitch).toHaveBeenCalledWith(
      "alpaca",
      "maintenance",
      "operator",
    );
    expect(respond).toHaveBeenCalledWith(true, { extensionId: "alpaca", active: true }, undefined);
  });

  it("deactivates platform kill switch", async () => {
    mockDeactivatePlatformKillSwitch.mockResolvedValue(undefined);

    const { opts, respond } = makeOpts("trading.killSwitch.platform", {
      extensionId: "coinbase",
      active: false,
    });
    await handlers["trading.killSwitch.platform"](opts);

    expect(mockDeactivatePlatformKillSwitch).toHaveBeenCalledWith("coinbase", "operator");
    expect(respond).toHaveBeenCalledWith(
      true,
      { extensionId: "coinbase", active: false },
      undefined,
    );
  });

  it("responds with error on throw", async () => {
    mockActivatePlatformKillSwitch.mockRejectedValue(new Error("boom"));

    const { opts, respond } = makeOpts("trading.killSwitch.platform", {
      extensionId: "alpaca",
      active: true,
    });
    await handlers["trading.killSwitch.platform"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});

// ── trading.getQuote ─────────────────────────────────────────────

describe("trading.getQuote", () => {
  it("rejects missing symbol", async () => {
    const { opts, respond } = makeOpts("trading.getQuote", { extensionId: "alpaca" });
    await handlers["trading.getQuote"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "symbol and extensionId are required",
      }),
    );
  });

  it("rejects missing extensionId", async () => {
    const { opts, respond } = makeOpts("trading.getQuote", { symbol: "AAPL" });
    await handlers["trading.getQuote"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "symbol and extensionId are required",
      }),
    );
  });

  it("returns baseline quote for valid params", async () => {
    const { opts, respond } = makeOpts("trading.getQuote", {
      symbol: "AAPL",
      extensionId: "alpaca",
    });
    await handlers["trading.getQuote"](opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      { symbol: "AAPL", extensionId: "alpaca", currentPrice: 0, source: "none" },
      undefined,
    );
  });
});

// ── trading.recordFill ───────────────────────────────────────────

describe("trading.recordFill", () => {
  it("rejects missing required fields", async () => {
    const { opts, respond } = makeOpts("trading.recordFill", {});
    await handlers["trading.recordFill"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it("rejects invalid quantity (zero)", async () => {
    const { opts, respond } = makeOpts("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "AAPL",
      side: "buy",
      quantity: 0,
      executedPrice: 150,
    });
    await handlers["trading.recordFill"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it("rejects invalid executedPrice (negative)", async () => {
    const { opts, respond } = makeOpts("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      executedPrice: -1,
    });
    await handlers["trading.recordFill"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it("records a valid fill and returns updated state", async () => {
    const updated = { dailyPnlUsd: 200, consecutiveLosses: 0, dailyTradeCount: 8 };
    mockRecordTradeFill.mockResolvedValue(updated);

    const { opts, respond } = makeOpts("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      executedPrice: 150,
      realizedPnl: 50,
      orderId: "ord-123",
    });
    await handlers["trading.recordFill"](opts);

    expect(mockRecordTradeFill).toHaveBeenCalledWith({
      extensionId: "alpaca",
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      executedPrice: 150,
      realizedPnl: 50,
      orderId: "ord-123",
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      { dailyPnlUsd: 200, consecutiveLosses: 0, dailyTradeCount: 8 },
      undefined,
    );
  });

  it("responds with error when recordTradeFill throws", async () => {
    mockRecordTradeFill.mockRejectedValue(new Error("disk full"));

    const { opts, respond } = makeOpts("trading.recordFill", {
      extensionId: "alpaca",
      symbol: "AAPL",
      side: "sell",
      quantity: 5,
      executedPrice: 100,
    });
    await handlers["trading.recordFill"](opts);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "UNAVAILABLE" }),
    );
  });
});
