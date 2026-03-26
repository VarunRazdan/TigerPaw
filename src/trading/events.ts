/**
 * Trading event types emitted by the policy engine, kill switch, and related subsystems.
 * These events are broadcast to connected UI clients via the gateway WebSocket.
 */

export type TradingEventType =
  | "trading.order.approved"
  | "trading.order.denied"
  | "trading.order.pending"
  | "trading.order.submitted"
  | "trading.order.filled"
  | "trading.order.failed"
  | "trading.killswitch.activated"
  | "trading.killswitch.deactivated"
  | "trading.limit.warning";

export type TradingEventPayload = {
  orderId?: string;
  extensionId?: string;
  symbol?: string;
  side?: "buy" | "sell" | "cancel";
  notionalUsd?: number;
  reason?: string;
  failedStep?: string;
  approvalMode?: string;
  limitName?: string;
  currentPercent?: number;
  thresholdPercent?: number;
  mode?: string;
};

export type TradingEvent = {
  type: TradingEventType;
  timestamp: number;
  payload: TradingEventPayload;
};
