/**
 * Jarvis proactive delivery.
 *
 * Polls `~/.tigerpaw/assistant/reminders.jsonl` every 30s and dispatches
 * due reminders via the outbound message pipeline. Also provides
 * `deliverToChannels`, a shared helper reused by the daily briefing cron.
 *
 * Contract:
 *   - A reminder is "due" when  active === true  &&  triggerAt <= now  &&  deliveredAt == null.
 *   - On successful dispatch:  deliveredAt = ISO-now,  deliveredOn = channel.
 *   - On failure: leave the record untouched so the next tick retries.
 *   - Recurring reminders: advance `triggerAt` to the next occurrence and
 *     clear  deliveredAt/deliveredOn  so the next tick fires again.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import { loadConfig } from "../../src/config/config.js";
import { sendMessage } from "../../src/infra/outbound/message.js";

// -- Types -------------------------------------------------------------------

export type ChannelTarget = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string;
};

type Reminder = {
  id: string;
  text: string;
  triggerAt: string;
  recurring?: string;
  active: boolean;
  created: string;
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
  deliveredAt?: string;
  deliveredOn?: string;
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

// -- Target parsing ----------------------------------------------------------

/**
 * Parse a channel target from either a `"channel:to[:accountId[:threadId]]"`
 * string or an object with `{channel, to, ...}`. Returns null for malformed
 * or empty inputs.
 */
export function parseChannelTarget(entry: unknown): ChannelTarget | null {
  if (!entry) {
    return null;
  }
  if (typeof entry === "string") {
    const parts = entry.split(":");
    if (parts.length < 2) {
      return null;
    }
    const [channel, to, accountId, threadId] = parts;
    if (!channel || !to) {
      return null;
    }
    const target: ChannelTarget = { channel, to };
    if (accountId) {
      target.accountId = accountId;
    }
    if (threadId) {
      target.threadId = threadId;
    }
    return target;
  }
  if (typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const channel = typeof obj.channel === "string" ? obj.channel : "";
    const to = typeof obj.to === "string" ? obj.to : "";
    if (!channel || !to) {
      return null;
    }
    const target: ChannelTarget = { channel, to };
    if (typeof obj.accountId === "string") {
      target.accountId = obj.accountId;
    }
    if (typeof obj.threadId === "string") {
      target.threadId = obj.threadId;
    }
    return target;
  }
  return null;
}

// -- Delivery ----------------------------------------------------------------

export type DeliverResult = { delivered: number; attempted: number };

/**
 * Deliver `text` to every configured target. Per-target errors are logged
 * and counted but do not stop the batch. Callers pass either an explicit
 * target (used when the reminder itself names a channel) or a list of
 * channel-target entries drawn from `cfg.dailyBriefing.channels`.
 */
export async function deliverToChannels(params: {
  text: string;
  channels: readonly unknown[];
  log: Logger;
  explicitTarget?: ChannelTarget;
  idempotencyKey?: string;
}): Promise<DeliverResult> {
  const targets: ChannelTarget[] = [];
  if (params.explicitTarget) {
    targets.push(params.explicitTarget);
  } else {
    for (const entry of params.channels) {
      const parsed = parseChannelTarget(entry);
      if (!parsed) {
        params.log.warn(
          `[assistant-delivery] skipping invalid channel entry: ${JSON.stringify(entry)}`,
        );
        continue;
      }
      targets.push(parsed);
    }
  }

  if (targets.length === 0) {
    return { delivered: 0, attempted: 0 };
  }

  const cfg = loadConfig();
  let delivered = 0;
  for (const target of targets) {
    try {
      await sendMessage({
        to: target.to,
        channel: target.channel,
        content: params.text,
        cfg,
        accountId: target.accountId,
        threadId: target.threadId,
        idempotencyKey: params.idempotencyKey,
        bestEffort: true,
      });
      delivered += 1;
    } catch (err) {
      params.log.error(
        `[assistant-delivery] send failed channel=${target.channel} to=${target.to}: ${String(err)}`,
      );
    }
  }
  return { delivered, attempted: targets.length };
}

// -- Reminder polling --------------------------------------------------------

function readRemindersFile(filePath: string, log?: Logger): Reminder[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) {
    return [];
  }
  // Resilience: a single malformed line should not crash the polling tick.
  // Skip and warn so the next tick still processes the rest of the file.
  const reminders: Reminder[] = [];
  for (const line of content.split("\n")) {
    if (!line) {
      continue;
    }
    try {
      reminders.push(JSON.parse(line) as Reminder);
    } catch (err) {
      log?.warn(
        `[assistant-delivery] skipping malformed reminder line: ${String(err)} | line=${line.slice(0, 80)}`,
      );
    }
  }
  return reminders;
}

function writeRemindersFile(filePath: string, reminders: Reminder[]): void {
  const serialized =
    reminders.map((r) => JSON.stringify(r)).join("\n") + (reminders.length > 0 ? "\n" : "");
  writeFileSync(filePath, serialized, "utf-8");
}

/**
 * Coarse cron-to-ms mapping. Matches the helper in cron-briefing.ts so that
 * "* * * * *" → 60s, "0 * * * *" → 1h, anything else → 24h. Recurring
 * reminders use this to step `triggerAt` to the next firing.
 */
function cronToMs(expr: string): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) {
    return 86_400_000;
  }
  const [min, hour] = parts;
  if (min === "*" && hour === "*") {
    return 60_000;
  }
  if (hour === "*") {
    return 3_600_000;
  }
  return 86_400_000;
}

function advanceRecurring(r: Reminder, now: number): Reminder {
  if (!r.recurring) {
    return r;
  }
  const stepMs = cronToMs(r.recurring);
  let next = new Date(r.triggerAt).getTime() + stepMs;
  // Skip any missed firings in one hop so we don't spam after a gap.
  while (next <= now) {
    next += stepMs;
  }
  return {
    ...r,
    triggerAt: new Date(next).toISOString(),
    deliveredAt: undefined,
    deliveredOn: undefined,
  };
}

/**
 * Run one pass over reminders.jsonl, dispatching any that are due. Idempotent
 * enough that calling it twice in quick succession will not double-send
 * (the second pass sees `deliveredAt` and skips). Safe against an empty or
 * missing file.
 */
export async function pollRemindersOnce(params: {
  log: Logger;
  now?: number;
  briefingChannels: readonly unknown[];
}): Promise<void> {
  const nowMs = params.now ?? Date.now();
  const dataDir = join(homedir(), ".tigerpaw", "assistant");
  const remindersFile = join(dataDir, "reminders.jsonl");
  const reminders = readRemindersFile(remindersFile, params.log);
  if (reminders.length === 0) {
    return;
  }

  // Defense-in-depth: even if a malicious tool call slipped past the
  // assistant_set_reminder allowlist check, the dispatch layer enforces it
  // again. Build the allowlist from briefingChannels and drop any
  // explicitTarget that isn't on it.
  const allowedTargetSet = new Set(
    params.briefingChannels
      .map((entry) => parseChannelTarget(entry))
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map((t) => `${t.channel}:${t.to}`),
  );

  let changed = false;
  const updated: Reminder[] = [];
  for (const reminder of reminders) {
    if (!reminder.active) {
      updated.push(reminder);
      continue;
    }
    if (reminder.deliveredAt) {
      // Already delivered; if recurring, advance now so it fires next tick.
      if (reminder.recurring) {
        updated.push(advanceRecurring(reminder, nowMs));
        changed = true;
        continue;
      }
      updated.push(reminder);
      continue;
    }
    const triggerMs = new Date(reminder.triggerAt).getTime();
    if (!Number.isFinite(triggerMs) || triggerMs > nowMs) {
      updated.push(reminder);
      continue;
    }

    let explicitTarget: ChannelTarget | undefined;
    if (reminder.channel && reminder.to) {
      const key = `${reminder.channel}:${reminder.to}`;
      if (allowedTargetSet.has(key)) {
        explicitTarget = {
          channel: reminder.channel,
          to: reminder.to,
          accountId: reminder.accountId,
          threadId: reminder.threadId,
        };
      } else {
        params.log.warn(
          `[assistant-delivery] reminder ${reminder.id} explicit target ${key} not in allowlist; falling back to dailyBriefing.channels`,
        );
      }
    }

    const result = await deliverToChannels({
      text: reminder.text,
      channels: params.briefingChannels,
      log: params.log,
      explicitTarget,
      idempotencyKey: `reminder:${reminder.id}:${reminder.triggerAt}`,
    });

    if (result.delivered === 0) {
      // Leave untouched so next tick retries.
      updated.push(reminder);
      continue;
    }

    const deliveredOn =
      explicitTarget?.channel ??
      parseChannelTarget(params.briefingChannels[0])?.channel ??
      "unknown";
    const stamped: Reminder = {
      ...reminder,
      deliveredAt: new Date(nowMs).toISOString(),
      deliveredOn,
    };
    updated.push(stamped);
    changed = true;
  }

  if (changed) {
    writeRemindersFile(remindersFile, updated);
  }
}

// -- Service registration ----------------------------------------------------

const POLL_INTERVAL_MS = 30_000;

/**
 * Register the delivery service with the plugin runtime. It polls once on
 * start, then every 30s. `getBriefingChannels` is a live getter so config
 * hot-reloads pick up new channel targets without restarting.
 */
export function registerDeliveryService(
  api: OpenClawPluginApi,
  getBriefingChannels: () => readonly unknown[],
): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  api.registerService({
    id: "assistant-delivery",
    start() {
      void pollRemindersOnce({
        log: api.logger,
        briefingChannels: getBriefingChannels(),
      }).catch((err) => {
        api.logger.error(`[assistant-delivery] initial poll failed: ${String(err)}`);
      });
      timer = setInterval(() => {
        void pollRemindersOnce({
          log: api.logger,
          briefingChannels: getBriefingChannels(),
        }).catch((err) => {
          api.logger.error(`[assistant-delivery] poll failed: ${String(err)}`);
        });
      }, POLL_INTERVAL_MS);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
      }
    },
  });
}
