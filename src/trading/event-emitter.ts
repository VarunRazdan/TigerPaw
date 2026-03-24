/**
 * Singleton event emitter for trading events.
 * The gateway subscribes via onTradingEvent() and broadcasts to connected UI clients.
 */

import { EventEmitter } from "node:events";
import type { TradingEvent } from "./events.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

/** Emit a trading event to all local subscribers (gateway broadcast, etc.). */
export function emitTradingEvent(event: TradingEvent): void {
  emitter.emit(event.type, event);
  emitter.emit("*", event);
}

/**
 * Subscribe to all trading events via the wildcard channel.
 * Returns an unsubscribe function.
 */
export function onTradingEvent(handler: (event: TradingEvent) => void): () => void {
  emitter.on("*", handler);
  return () => {
    emitter.off("*", handler);
  };
}
