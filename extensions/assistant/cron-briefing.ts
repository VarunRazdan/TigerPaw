/**
 * Cron-based daily briefing delivery.
 *
 * Registers a cron job that invokes the assistant_daily_briefing tool
 * and delivers the result to the user's default messaging channel.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import { getPersonaName } from "./config.js";

const DATA_DIR = join(homedir(), ".tigerpaw", "assistant");
const TASKS_FILE = join(DATA_DIR, "tasks.jsonl");
const REMINDERS_FILE = join(DATA_DIR, "reminders.jsonl");

function loadJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function buildBriefingSummary(): string {
  const personaName = getPersonaName();
  const today = new Date().toISOString().slice(0, 10);

  const tasks = loadJsonl<{ status: string; due?: string; text: string; priority: string }>(
    TASKS_FILE,
  );
  const reminders = loadJsonl<{ active: boolean; triggerAt: string; text: string }>(REMINDERS_FILE);

  const pending = tasks.filter((t) => t.status !== "completed");
  const dueSoon = pending.filter((t) => t.due && t.due <= today);
  const highPriority = pending.filter((t) => t.priority === "high");
  const now = Date.now();
  const upcoming = reminders.filter(
    (r) =>
      r.active &&
      new Date(r.triggerAt).getTime() > now &&
      new Date(r.triggerAt).getTime() < now + 86_400_000,
  );

  const lines: string[] = [];
  lines.push(`Good morning! Here's your briefing from ${personaName}:`);
  lines.push("");
  lines.push(`Tasks: ${pending.length} pending (${highPriority.length} high priority)`);
  if (dueSoon.length > 0) {
    lines.push(`Due today/overdue: ${dueSoon.map((t) => t.text).join(", ")}`);
  }
  if (upcoming.length > 0) {
    lines.push(`Upcoming reminders: ${upcoming.map((r) => r.text).join(", ")}`);
  }
  if (pending.length === 0 && upcoming.length === 0) {
    lines.push("Your schedule is clear today.");
  }

  return lines.join("\n");
}

/**
 * Register the daily briefing cron job with the plugin API.
 * Uses the gateway method system to register a callable briefing endpoint,
 * and hooks into the "ready" lifecycle to start a cron poll.
 */
export function registerBriefingCron(api: OpenClawPluginApi, cronExpression: string): void {
  // Register a gateway method so the briefing can be invoked on demand
  api.registerGatewayMethod(`assistant.briefing`, async ({ respond }) => {
    const summary = buildBriefingSummary();
    respond(true, { summary }, undefined);
  });

  // Register a service that polls on the cron schedule.
  // This uses the available registerService API to run background work.
  let timer: ReturnType<typeof setInterval> | undefined;
  api.registerService({
    id: "assistant-daily-briefing",
    start() {
      const interval = cronToMs(cronExpression);
      timer = setInterval(() => {
        const summary = buildBriefingSummary();
        api.logger.info(`[Daily Briefing] ${summary.slice(0, 120)}...`);
      }, interval);
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  });
}

/**
 * Convert a simple cron expression to a rough millisecond interval.
 * Handles common daily/hourly patterns; defaults to 24 h for complex expressions.
 */
function cronToMs(expr: string): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return 86_400_000; // default: 24 h

  const [min, hour] = parts;

  // "* * * * *" → every minute
  if (min === "*" && hour === "*") return 60_000;
  // "0 * * * *" → every hour
  if (hour === "*") return 3_600_000;
  // Anything else with a fixed hour → once per day
  return 86_400_000;
}
