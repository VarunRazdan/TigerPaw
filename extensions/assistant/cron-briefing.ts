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
import { getPersonaName, type AssistantPersona } from "./config.js";

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

function buildBriefingSummary(persona: AssistantPersona): string {
  const personaName = getPersonaName(persona);
  const today = new Date().toISOString().slice(0, 10);

  const tasks = loadJsonl<{ status: string; due?: string; text: string; priority: string }>(
    TASKS_FILE,
  );
  const reminders = loadJsonl<{ active: boolean; triggerAt: number; text: string }>(REMINDERS_FILE);

  const pending = tasks.filter((t) => t.status !== "completed");
  const dueSoon = pending.filter((t) => t.due && t.due <= today);
  const highPriority = pending.filter((t) => t.priority === "high");
  const upcoming = reminders.filter(
    (r) => r.active && r.triggerAt > Date.now() && r.triggerAt < Date.now() + 86_400_000,
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
 * The cron infrastructure will call this on schedule.
 */
export function registerBriefingCron(
  api: OpenClawPluginApi,
  persona: AssistantPersona,
  cronExpression: string,
): void {
  // Register a cron-triggered handler
  if (typeof api.registerCron === "function") {
    api.registerCron({
      id: "assistant-daily-briefing",
      label: `${getPersonaName(persona)}'s Daily Briefing`,
      schedule: cronExpression,
      async handler() {
        const summary = buildBriefingSummary(persona);

        // Deliver to the default channel if outbound delivery is available
        if (typeof api.sendMessage === "function") {
          await api.sendMessage({ text: summary });
        }

        return { ok: true, summary };
      },
    });
  }
}
