/**
 * Tigerpaw Personal Assistant Extension
 *
 * A personal AI assistant with two persona options (Kiera / Jarvis).
 * Provides task management, reminders, daily briefings, conversation
 * summarization, and memory search — all running locally.
 *
 * Tools:
 *   assistant_daily_briefing       — Generate context-aware daily briefing
 *   assistant_add_task             — Add a task with priority and due date
 *   assistant_list_tasks           — List tasks with filters
 *   assistant_complete_task        — Mark a task as complete
 *   assistant_delete_task          — Delete a task
 *   assistant_set_reminder         — Create a reminder
 *   assistant_list_reminders       — List active reminders
 *   assistant_cancel_reminder      — Cancel a reminder
 *   assistant_summarize_conversation — Summarize and store in memory
 *   assistant_search_memory        — Search personal memory
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "tigerpaw/plugin-sdk/core";
import {
  assistantConfigSchema,
  getPersonaGreeting,
  getPersonaSignoff,
  getPersonaName,
  type AssistantConfig,
  type AssistantPersona,
} from "./config.js";

// -- Constants ---------------------------------------------------------------
const EXTENSION_ID = "assistant";
const DATA_DIR = join(homedir(), ".tigerpaw", "assistant");
const TASKS_FILE = join(DATA_DIR, "tasks.jsonl");
const REMINDERS_FILE = join(DATA_DIR, "reminders.jsonl");

// -- Types -------------------------------------------------------------------
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "open" | "completed";

type Task = {
  id: string;
  text: string;
  priority: TaskPriority;
  status: TaskStatus;
  due?: string; // ISO date string (YYYY-MM-DD)
  tags: string[];
  created: string; // ISO timestamp
  completed?: string; // ISO timestamp
};

type Reminder = {
  id: string;
  text: string;
  triggerAt: string; // ISO timestamp
  recurring?: string; // cron expression for recurring
  active: boolean;
  created: string;
};

// -- Helpers -----------------------------------------------------------------
function txt(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function txtD(text: string, details: unknown) {
  return { ...txt(text), details };
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function writeJsonl<T>(filePath: string, items: T[]): void {
  ensureDataDir();
  writeFileSync(filePath, items.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf-8");
}

function appendJsonl<T>(filePath: string, item: T): void {
  ensureDataDir();
  appendFileSync(filePath, JSON.stringify(item) + "\n", "utf-8");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTask(task: Task, persona: AssistantPersona): string {
  const statusIcon = task.status === "completed" ? "\u2713" : "\u25CB";
  const priorityTag = task.priority !== "medium" ? ` [${task.priority}]` : "";
  const dueTag = task.due ? ` (due: ${task.due})` : "";
  const tagsStr = task.tags.length > 0 ? ` #${task.tags.join(" #")}` : "";
  return `${statusIcon} ${task.text}${priorityTag}${dueTag}${tagsStr}`;
}

function formatReminder(r: Reminder): string {
  const status = r.active ? "\u23F0" : "\u2717";
  const recurTag = r.recurring ? ` [recurring: ${r.recurring}]` : "";
  return `${status} ${r.text} \u2014 ${new Date(r.triggerAt).toLocaleString()}${recurTag}`;
}

// -- Plugin registration -----------------------------------------------------
export default {
  id: EXTENSION_ID,
  name: "Personal Assistant",
  description: "Personal AI assistant with task management, reminders, and daily briefings",
  kind: "utility" as const,
  configSchema: assistantConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = assistantConfigSchema.parse(api.pluginConfig);
    const persona = cfg.persona;
    const personaName = getPersonaName(persona);

    // -- Tool 1: Daily Briefing --------------------------------------------
    api.registerTool(
      {
        name: "assistant_daily_briefing",
        label: `${personaName}'s Daily Briefing`,
        description: `${personaName} generates a daily briefing summarizing pending tasks, upcoming reminders, and recent activity.`,
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        async execute() {
          const tasks = readJsonl<Task>(TASKS_FILE);
          const reminders = readJsonl<Reminder>(REMINDERS_FILE);
          const todayStr = today();

          const openTasks = tasks.filter((t) => t.status === "open");
          const dueTodayTasks = openTasks.filter((t) => t.due === todayStr);
          const overdueTasks = openTasks.filter((t) => t.due && t.due < todayStr);
          const urgentTasks = openTasks.filter((t) => t.priority === "urgent");

          const activeReminders = reminders.filter((r) => r.active);
          const todayReminders = activeReminders.filter((r) => r.triggerAt.startsWith(todayStr));

          const recentCompleted = tasks
            .filter((t) => t.status === "completed" && t.completed)
            .sort((a, b) => (b.completed! > a.completed! ? 1 : -1))
            .slice(0, 5);

          const lines: string[] = [];
          lines.push(getPersonaGreeting(persona));
          lines.push(
            `Here's your briefing for ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}:`,
          );
          lines.push("");

          // Overdue
          if (overdueTasks.length > 0) {
            lines.push(`\u26A0 OVERDUE (${overdueTasks.length}):`);
            overdueTasks.forEach((t) => lines.push(`  ${formatTask(t, persona)}`));
            lines.push("");
          }

          // Due today
          if (dueTodayTasks.length > 0) {
            lines.push(`\uD83D\uDCCB DUE TODAY (${dueTodayTasks.length}):`);
            dueTodayTasks.forEach((t) => lines.push(`  ${formatTask(t, persona)}`));
            lines.push("");
          }

          // Urgent
          if (
            urgentTasks.length > 0 &&
            urgentTasks.some((t) => !dueTodayTasks.includes(t) && !overdueTasks.includes(t))
          ) {
            const nonDueUrgent = urgentTasks.filter(
              (t) => !dueTodayTasks.includes(t) && !overdueTasks.includes(t),
            );
            if (nonDueUrgent.length > 0) {
              lines.push(`\uD83D\uDD34 URGENT (${nonDueUrgent.length}):`);
              nonDueUrgent.forEach((t) => lines.push(`  ${formatTask(t, persona)}`));
              lines.push("");
            }
          }

          // Today's reminders
          if (todayReminders.length > 0) {
            lines.push(`\u23F0 REMINDERS TODAY (${todayReminders.length}):`);
            todayReminders.forEach((r) => lines.push(`  ${formatReminder(r)}`));
            lines.push("");
          }

          // Summary stats
          lines.push("\uD83D\uDCCA SUMMARY:");
          lines.push(`  Open tasks: ${openTasks.length}`);
          lines.push(`  Active reminders: ${activeReminders.length}`);
          if (recentCompleted.length > 0) {
            lines.push(`  Recently completed: ${recentCompleted.length}`);
          }

          if (openTasks.length === 0 && activeReminders.length === 0) {
            lines.push("");
            lines.push("Your slate is clean \u2014 no pending tasks or reminders.");
          }

          lines.push("");
          lines.push(getPersonaSignoff(persona));

          return txtD(lines.join("\n"), {
            openTasks: openTasks.length,
            overdue: overdueTasks.length,
            dueToday: dueTodayTasks.length,
            urgent: urgentTasks.length,
            activeReminders: activeReminders.length,
          });
        },
      },
      { name: "assistant_daily_briefing" },
    );

    // -- Tool 2: Add Task --------------------------------------------------
    api.registerTool(
      {
        name: "assistant_add_task",
        label: "Add Task",
        description: `Add a new task. ${personaName} will track it for you.`,
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Task description" },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
              description: "Task priority (default: medium)",
            },
            due: {
              type: "string",
              description: "Due date in YYYY-MM-DD format (optional)",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags for categorization",
            },
          },
          required: ["text"],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { text: string; priority?: string; due?: string; tags?: string[] };
          if (!p.text || typeof p.text !== "string" || p.text.trim().length === 0) {
            return txt("Task text is required.");
          }

          const tasks = readJsonl<Task>(TASKS_FILE);
          if (tasks.filter((t) => t.status === "open").length >= cfg.taskManagement.maxTasks) {
            return txt(
              `Task limit reached (${cfg.taskManagement.maxTasks}). Complete or delete existing tasks first.`,
            );
          }

          const priority: TaskPriority =
            p.priority && ["low", "medium", "high", "urgent"].includes(p.priority)
              ? (p.priority as TaskPriority)
              : "medium";

          if (p.due && !/^\d{4}-\d{2}-\d{2}$/.test(p.due)) {
            return txt("Due date must be in YYYY-MM-DD format.");
          }

          const task: Task = {
            id: randomUUID(),
            text: p.text.trim(),
            priority,
            status: "open",
            due: p.due,
            tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
            created: new Date().toISOString(),
          };

          appendJsonl(TASKS_FILE, task);
          return txtD(
            `${personaName} added task: "${task.text}" [${priority}]${task.due ? ` (due ${task.due})` : ""}`,
            task,
          );
        },
      },
      { name: "assistant_add_task" },
    );

    // -- Tool 3: List Tasks ------------------------------------------------
    api.registerTool(
      {
        name: "assistant_list_tasks",
        label: "List Tasks",
        description: `${personaName} lists your tasks with optional filters.`,
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["open", "completed", "all"],
              description: "Filter by status (default: open)",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
              description: "Filter by priority",
            },
            tag: { type: "string", description: "Filter by tag" },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { status?: string; priority?: string; tag?: string };
          let tasks = readJsonl<Task>(TASKS_FILE);

          const statusFilter = p.status || "open";
          if (statusFilter !== "all") {
            tasks = tasks.filter((t) => t.status === statusFilter);
          }
          if (p.priority) {
            tasks = tasks.filter((t) => t.priority === p.priority);
          }
          if (p.tag) {
            tasks = tasks.filter((t) => t.tags.includes(p.tag!));
          }

          if (tasks.length === 0) {
            return txt(`No ${statusFilter} tasks found.`);
          }

          // Sort: urgent first, then by due date, then by creation date
          tasks.sort((a, b) => {
            const priorityOrder: Record<TaskPriority, number> = {
              urgent: 0,
              high: 1,
              medium: 2,
              low: 3,
            };
            const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (pDiff !== 0) return pDiff;
            if (a.due && b.due) return a.due.localeCompare(b.due);
            if (a.due) return -1;
            if (b.due) return 1;
            return a.created.localeCompare(b.created);
          });

          const lines = [`${personaName}'s task list (${tasks.length} ${statusFilter}):`, ""];
          tasks.forEach((t, i) => {
            lines.push(`${i + 1}. ${formatTask(t, persona)}`);
            lines.push(`   ID: ${t.id.slice(0, 8)}`);
          });

          return txtD(lines.join("\n"), { count: tasks.length, tasks });
        },
      },
      { name: "assistant_list_tasks" },
    );

    // -- Tool 4: Complete Task ---------------------------------------------
    api.registerTool(
      {
        name: "assistant_complete_task",
        label: "Complete Task",
        description: "Mark a task as completed by its ID (or first few characters of the ID).",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID (or prefix)" },
          },
          required: ["taskId"],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { taskId: string };
          if (!p.taskId) return txt("Task ID is required.");

          const tasks = readJsonl<Task>(TASKS_FILE);
          const task = tasks.find((t) => t.id.startsWith(p.taskId));
          if (!task) return txt(`No task found matching "${p.taskId}".`);
          if (task.status === "completed") return txt(`Task "${task.text}" is already completed.`);

          task.status = "completed";
          task.completed = new Date().toISOString();
          writeJsonl(TASKS_FILE, tasks);

          return txtD(`${personaName} marked as done: "${task.text}"`, task);
        },
      },
      { name: "assistant_complete_task" },
    );

    // -- Tool 5: Delete Task -----------------------------------------------
    api.registerTool(
      {
        name: "assistant_delete_task",
        label: "Delete Task",
        description: "Permanently delete a task by its ID.",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID (or prefix)" },
          },
          required: ["taskId"],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { taskId: string };
          if (!p.taskId) return txt("Task ID is required.");

          const tasks = readJsonl<Task>(TASKS_FILE);
          const idx = tasks.findIndex((t) => t.id.startsWith(p.taskId));
          if (idx === -1) return txt(`No task found matching "${p.taskId}".`);

          const [deleted] = tasks.splice(idx, 1);
          writeJsonl(TASKS_FILE, tasks);

          return txtD(`${personaName} deleted task: "${deleted.text}"`, deleted);
        },
      },
      { name: "assistant_delete_task" },
    );

    // -- Tool 6: Set Reminder ----------------------------------------------
    api.registerTool(
      {
        name: "assistant_set_reminder",
        label: "Set Reminder",
        description: `${personaName} will remind you at the specified time.`,
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Reminder message" },
            triggerAt: {
              type: "string",
              description: "When to trigger (ISO timestamp, e.g. 2026-03-27T09:00:00)",
            },
            recurring: {
              type: "string",
              description:
                "Cron expression for recurring reminders (optional, e.g. '0 9 * * 1-5' for weekday mornings)",
            },
          },
          required: ["text", "triggerAt"],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { text: string; triggerAt: string; recurring?: string };
          if (!p.text?.trim()) return txt("Reminder text is required.");
          if (!p.triggerAt) return txt("Trigger time is required (ISO timestamp).");

          const triggerDate = new Date(p.triggerAt);
          if (isNaN(triggerDate.getTime()))
            return txt("Invalid trigger time. Use ISO format (e.g. 2026-03-27T09:00:00).");

          const reminder: Reminder = {
            id: randomUUID(),
            text: p.text.trim(),
            triggerAt: triggerDate.toISOString(),
            recurring: p.recurring,
            active: true,
            created: new Date().toISOString(),
          };

          appendJsonl(REMINDERS_FILE, reminder);

          const timeStr = triggerDate.toLocaleString();
          const recurStr = p.recurring ? ` (recurring: ${p.recurring})` : "";
          return txtD(
            `${personaName} set reminder: "${reminder.text}" for ${timeStr}${recurStr}`,
            reminder,
          );
        },
      },
      { name: "assistant_set_reminder" },
    );

    // -- Tool 7: List Reminders --------------------------------------------
    api.registerTool(
      {
        name: "assistant_list_reminders",
        label: "List Reminders",
        description: `${personaName} shows your active reminders.`,
        parameters: {
          type: "object",
          properties: {
            includeInactive: {
              type: "boolean",
              description: "Include cancelled reminders (default: false)",
            },
          },
          required: [],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { includeInactive?: boolean };
          let reminders = readJsonl<Reminder>(REMINDERS_FILE);

          if (!p.includeInactive) {
            reminders = reminders.filter((r) => r.active);
          }

          if (reminders.length === 0) {
            return txt("No active reminders.");
          }

          reminders.sort((a, b) => a.triggerAt.localeCompare(b.triggerAt));

          const lines = [`${personaName}'s reminders (${reminders.length}):`, ""];
          reminders.forEach((r, i) => {
            lines.push(`${i + 1}. ${formatReminder(r)}`);
            lines.push(`   ID: ${r.id.slice(0, 8)}`);
          });

          return txtD(lines.join("\n"), { count: reminders.length, reminders });
        },
      },
      { name: "assistant_list_reminders" },
    );

    // -- Tool 8: Cancel Reminder -------------------------------------------
    api.registerTool(
      {
        name: "assistant_cancel_reminder",
        label: "Cancel Reminder",
        description: "Cancel an active reminder by its ID.",
        parameters: {
          type: "object",
          properties: {
            reminderId: { type: "string", description: "Reminder ID (or prefix)" },
          },
          required: ["reminderId"],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { reminderId: string };
          if (!p.reminderId) return txt("Reminder ID is required.");

          const reminders = readJsonl<Reminder>(REMINDERS_FILE);
          const reminder = reminders.find((r) => r.id.startsWith(p.reminderId));
          if (!reminder) return txt(`No reminder found matching "${p.reminderId}".`);
          if (!reminder.active) return txt(`Reminder "${reminder.text}" is already cancelled.`);

          reminder.active = false;
          writeJsonl(REMINDERS_FILE, reminders);

          return txtD(`${personaName} cancelled reminder: "${reminder.text}"`, reminder);
        },
      },
      { name: "assistant_cancel_reminder" },
    );

    // -- Tool 9: Summarize Conversation ------------------------------------
    api.registerTool(
      {
        name: "assistant_summarize_conversation",
        label: "Summarize Conversation",
        description: `${personaName} summarizes the conversation and stores key points in memory for future reference.`,
        parameters: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "The conversation summary to store",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorizing the summary",
            },
          },
          required: ["summary"],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { summary: string; tags?: string[] };
          if (!p.summary?.trim()) return txt("Summary text is required.");

          const entry = {
            id: randomUUID(),
            type: "conversation_summary",
            text: p.summary.trim(),
            tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
            timestamp: new Date().toISOString(),
            persona,
          };

          const memoriesFile = join(DATA_DIR, "memories.jsonl");
          appendJsonl(memoriesFile, entry);

          return txtD(
            `${personaName} stored conversation summary (${entry.tags.length} tags).`,
            entry,
          );
        },
      },
      { name: "assistant_summarize_conversation" },
    );

    // -- Tool 10: Search Memory --------------------------------------------
    api.registerTool(
      {
        name: "assistant_search_memory",
        label: "Search Memory",
        description: `${personaName} searches your stored memories and conversation summaries.`,
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            tag: { type: "string", description: "Filter by tag (optional)" },
            limit: { type: "number", description: "Max results (default: 10)" },
          },
          required: ["query"],
        },
        async execute(_id: string, params: unknown) {
          const p = params as { query: string; tag?: string; limit?: number };
          if (!p.query?.trim()) return txt("Search query is required.");

          const memoriesFile = join(DATA_DIR, "memories.jsonl");
          let memories = readJsonl<{
            id: string;
            type: string;
            text: string;
            tags: string[];
            timestamp: string;
          }>(memoriesFile);

          // Simple keyword search (case-insensitive)
          const queryLower = p.query.toLowerCase();
          memories = memories.filter((m) => m.text.toLowerCase().includes(queryLower));

          if (p.tag) {
            memories = memories.filter((m) => m.tags.includes(p.tag!));
          }

          // Sort by most recent first
          memories.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

          const limit = typeof p.limit === "number" && p.limit > 0 ? p.limit : 10;
          memories = memories.slice(0, limit);

          if (memories.length === 0) {
            return txt(`${personaName} found no memories matching "${p.query}".`);
          }

          const lines = [`${personaName} found ${memories.length} memory entries:`, ""];
          memories.forEach((m, i) => {
            const dateStr = new Date(m.timestamp).toLocaleDateString();
            const tagsStr = m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
            lines.push(`${i + 1}. (${dateStr}${tagsStr})`);
            lines.push(`   ${m.text.length > 200 ? m.text.slice(0, 200) + "..." : m.text}`);
            lines.push("");
          });

          return txtD(lines.join("\n"), { count: memories.length, results: memories });
        },
      },
      { name: "assistant_search_memory" },
    );
  },
};
