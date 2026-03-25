/**
 * Proactive trading notification dispatcher.
 *
 * Subscribes to trading events and pushes formatted messages to configured
 * messaging channels (Telegram, Discord, Slack, etc.) via the existing
 * outbound delivery infrastructure.
 */

import type { ReplyPayload } from "../auto-reply/types.js";
import { createOutboundSendDeps, type CliDeps } from "../cli/outbound-send-deps.js";
import type { OpenClawConfig } from "../config/config.js";
import { deliverOutboundPayloads } from "../infra/outbound/deliver.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { TradingNotificationsConfig, TradingNotificationTarget } from "./config.js";
import { onTradingEvent } from "./event-emitter.js";
import type { TradingEvent, TradingEventType } from "./events.js";

const log = createSubsystemLogger("trading/notifications");

// ── Event formatting ────────────────────────────────────────────────

function formatSymbolInfo(event: TradingEvent): string {
  const p = event.payload;
  const parts: string[] = [];
  if (p.symbol) {
    parts.push(p.symbol);
  }
  if (p.side) {
    parts.push(p.side.toUpperCase());
  }
  if (p.notionalUsd !== undefined) {
    parts.push(`$${p.notionalUsd.toFixed(2)}`);
  }
  if (p.extensionId) {
    parts.push(`via ${p.extensionId}`);
  }
  return parts.length > 0 ? parts.join(" ") : "";
}

function formatTradingEvent(event: TradingEvent): string {
  const info = formatSymbolInfo(event);

  switch (event.type) {
    case "trading.order.approved": {
      const mode = event.payload.approvalMode ? ` (${event.payload.approvalMode})` : "";
      return `Order approved${mode}: ${info}`;
    }
    case "trading.order.denied": {
      const reason = event.payload.reason ?? event.payload.failedStep ?? "policy check failed";
      return `Order denied: ${info} — ${reason}`;
    }
    case "trading.order.pending": {
      const mode = event.payload.approvalMode ?? "confirmation";
      return `Order pending ${mode}: ${info}`;
    }
    case "trading.order.submitted":
      return `Order submitted: ${info}`;
    case "trading.order.filled":
      return `Order filled: ${info}`;
    case "trading.order.failed": {
      const reason = event.payload.reason ?? "unknown error";
      return `Order failed: ${info} — ${reason}`;
    }
    case "trading.killswitch.activated": {
      const mode = event.payload.mode ? ` (${event.payload.mode})` : "";
      const reason = event.payload.reason ? ` — ${event.payload.reason}` : "";
      const scope = event.payload.extensionId ? ` [${event.payload.extensionId}]` : " [global]";
      return `Kill switch activated${mode}${scope}${reason}`;
    }
    case "trading.killswitch.deactivated": {
      const scope = event.payload.extensionId ? ` [${event.payload.extensionId}]` : " [global]";
      return `Kill switch deactivated${scope} — trading resumed`;
    }
    case "trading.limit.warning": {
      const name = event.payload.limitName ?? "limit";
      const pct = event.payload.currentPercent?.toFixed(0) ?? "?";
      const threshold = event.payload.thresholdPercent?.toFixed(0) ?? "?";
      return `Limit warning: ${name} at ${pct}% (threshold: ${threshold}%)`;
    }
    default: {
      const _exhaustive: never = event.type;
      return `Trading event: ${String(_exhaustive)}`;
    }
  }
}

// ── Target filtering ────────────────────────────────────────────────

function shouldSendToTarget(
  target: TradingNotificationTarget,
  eventType: TradingEventType,
): boolean {
  // If no event filter is configured, send all events.
  if (!target.events || target.events.length === 0) {
    return true;
  }
  return target.events.includes(eventType);
}

// ── Dispatcher ──────────────────────────────────────────────────────

type NotificationDispatchParams = {
  cfg: OpenClawConfig;
  notificationsConfig: TradingNotificationsConfig;
  deps: CliDeps;
};

/**
 * Start the trading notification dispatcher.
 *
 * Subscribes to all trading events and delivers formatted messages to each
 * configured notification target. Returns an unsubscribe function for cleanup.
 */
export function startTradingNotificationDispatch(params: NotificationDispatchParams): () => void {
  const { cfg, notificationsConfig, deps } = params;
  const targets = notificationsConfig.targets;

  if (!targets || targets.length === 0) {
    log.info("no notification targets configured — dispatcher idle");
    return () => {};
  }

  log.info(`trading notification dispatcher started with ${targets.length} target(s)`);

  const sendDeps = createOutboundSendDeps(deps);

  const unsubscribe = onTradingEvent((event: TradingEvent) => {
    // Fire-and-forget delivery to each matching target.
    for (const target of targets) {
      if (!shouldSendToTarget(target, event.type)) {
        continue;
      }

      const text = formatTradingEvent(event);
      const payload: ReplyPayload = { text };

      deliverOutboundPayloads({
        cfg,
        channel: target.channel as Exclude<
          import("../infra/outbound/targets.js").OutboundChannel,
          "none"
        >,
        to: target.to,
        accountId: target.accountId,
        threadId: target.threadId,
        payloads: [payload],
        deps: sendDeps,
        bestEffort: true,
        skipQueue: true,
      }).catch((err) => {
        log.warn(
          `failed to deliver trading notification to ${target.channel}:${target.to}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  });

  return unsubscribe;
}
