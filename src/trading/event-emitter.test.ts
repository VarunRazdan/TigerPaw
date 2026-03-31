import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TradingEvent, TradingEventType } from "./events.js";

// No mocks needed — we test the real event emitter module directly.
// We do need to reset modules between tests to get a fresh EventEmitter instance.

describe("event-emitter", () => {
  let emitTradingEvent: typeof import("./event-emitter.js").emitTradingEvent;
  let onTradingEvent: typeof import("./event-emitter.js").onTradingEvent;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./event-emitter.js");
    emitTradingEvent = mod.emitTradingEvent;
    onTradingEvent = mod.onTradingEvent;
  });

  function makeEvent(
    type: TradingEventType = "trading.order.filled",
    overrides: Partial<TradingEvent> = {},
  ): TradingEvent {
    return {
      type,
      timestamp: Date.now(),
      payload: { symbol: "AAPL", side: "buy" },
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Wildcard channel
  // -------------------------------------------------------------------------
  it("delivers events to wildcard subscribers via onTradingEvent", () => {
    const handler = vi.fn();
    onTradingEvent(handler);

    const event = makeEvent("trading.order.filled");
    emitTradingEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("delivers events of any type to wildcard subscribers", () => {
    const handler = vi.fn();
    onTradingEvent(handler);

    const types: TradingEventType[] = [
      "trading.order.approved",
      "trading.order.denied",
      "trading.killswitch.activated",
    ];

    for (const type of types) {
      emitTradingEvent(makeEvent(type));
    }

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0][0].type).toBe("trading.order.approved");
    expect(handler.mock.calls[1][0].type).toBe("trading.order.denied");
    expect(handler.mock.calls[2][0].type).toBe("trading.killswitch.activated");
  });

  // -------------------------------------------------------------------------
  // Multiple subscribers
  // -------------------------------------------------------------------------
  it("delivers events to multiple subscribers", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();

    onTradingEvent(handler1);
    onTradingEvent(handler2);
    onTradingEvent(handler3);

    const event = makeEvent();
    emitTradingEvent(event);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Unsubscribe
  // -------------------------------------------------------------------------
  it("unsubscribe stops delivery to that handler", () => {
    const handler = vi.fn();
    const unsub = onTradingEvent(handler);

    emitTradingEvent(makeEvent());
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();

    emitTradingEvent(makeEvent());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe does not affect other subscribers", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const unsub1 = onTradingEvent(handler1);
    onTradingEvent(handler2);

    unsub1();
    emitTradingEvent(makeEvent());

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // No subscribers — no-throw
  // -------------------------------------------------------------------------
  it("does not throw when emitting with no subscribers", () => {
    expect(() => emitTradingEvent(makeEvent())).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Rapid sequential emissions
  // -------------------------------------------------------------------------
  it("handles rapid sequential emissions in order", () => {
    const received: string[] = [];
    onTradingEvent((event) => {
      received.push(event.payload.symbol ?? "unknown");
    });

    const symbols = ["AAPL", "MSFT", "GOOG", "TSLA", "AMZN"];
    for (const symbol of symbols) {
      emitTradingEvent(makeEvent("trading.order.filled", { payload: { symbol } }));
    }

    expect(received).toEqual(symbols);
  });

  // -------------------------------------------------------------------------
  // Event payload integrity
  // -------------------------------------------------------------------------
  it("passes the exact event object to subscribers", () => {
    const handler = vi.fn();
    onTradingEvent(handler);

    const event = makeEvent("trading.killswitch.activated", {
      payload: { reason: "drawdown breach", mode: "hard" },
    });
    emitTradingEvent(event);

    const received = handler.mock.calls[0][0];
    expect(received).toBe(event); // strict reference equality
    expect(received.payload.reason).toBe("drawdown breach");
    expect(received.payload.mode).toBe("hard");
  });

  // -------------------------------------------------------------------------
  // Double unsubscribe is safe
  // -------------------------------------------------------------------------
  it("calling unsubscribe twice does not throw", () => {
    const handler = vi.fn();
    const unsub = onTradingEvent(handler);

    unsub();
    expect(() => unsub()).not.toThrow();

    // Handler should still not fire
    emitTradingEvent(makeEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Timestamp preservation
  // -------------------------------------------------------------------------
  it("preserves event timestamp through emission", () => {
    const handler = vi.fn();
    onTradingEvent(handler);

    const fixedTs = 1_700_000_000_000;
    const event = makeEvent("trading.order.submitted", { timestamp: fixedTs });
    emitTradingEvent(event);

    expect(handler.mock.calls[0][0].timestamp).toBe(fixedTs);
  });
});
