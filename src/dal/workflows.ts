/**
 * Workflow DAL — SQLite-backed CRUD for workflow definitions.
 *
 * Replaces flat-file I/O in `gateway/server-methods/workflows.ts` and
 * the `loadWorkflow`/`loadAllWorkflows` methods in `workflows/index.ts`.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// ── Legacy flat-file imports (fallback) ─────────────────────────
import type { DatabaseSync } from "node:sqlite";
import type { Workflow } from "../workflows/types.js";
import { getDatabase, isDatabaseAvailable } from "./database.js";

const LEGACY_DIR = join(homedir(), ".tigerpaw", "workflows");

function legacyEnsureDir(): void {
  if (!existsSync(LEGACY_DIR)) {
    mkdirSync(LEGACY_DIR, { recursive: true });
  }
}

// ── SQLite implementations ──────────────────────────────────────

function dbListWorkflows(db: DatabaseSync): Workflow[] {
  const rows = db.prepare("SELECT * FROM workflows ORDER BY updated_at DESC").all() as Array<
    Record<string, unknown>
  >;
  return rows.map(rowToWorkflow);
}

function dbGetWorkflow(db: DatabaseSync, id: string): Workflow | null {
  const row = db.prepare("SELECT * FROM workflows WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToWorkflow(row) : null;
}

function dbSaveWorkflow(db: DatabaseSync, workflow: Workflow): void {
  db.prepare(`
    INSERT OR REPLACE INTO workflows
      (id, name, description, enabled, nodes, edges, created_at, updated_at, last_run_at, run_count, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workflow.id,
    workflow.name,
    workflow.description ?? "",
    workflow.enabled ? 1 : 0,
    JSON.stringify(workflow.nodes),
    JSON.stringify(workflow.edges),
    workflow.createdAt,
    workflow.updatedAt,
    workflow.lastRunAt ?? null,
    workflow.runCount ?? 0,
    workflow.version ?? 0,
  );
}

function dbDeleteWorkflow(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
  return result.changes > 0;
}

function dbUpdateRunStats(db: DatabaseSync, id: string, lastRunAt: string, runCount: number): void {
  db.prepare("UPDATE workflows SET last_run_at = ?, run_count = ? WHERE id = ?").run(
    lastRunAt,
    runCount,
    id,
  );
}

function dbToggleWorkflow(db: DatabaseSync, id: string): Workflow | null {
  const existing = dbGetWorkflow(db, id);
  if (!existing) {
    return null;
  }

  existing.enabled = !existing.enabled;
  existing.updatedAt = new Date().toISOString();
  dbSaveWorkflow(db, existing);
  return existing;
}

function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    enabled: Boolean(row.enabled),
    nodes: JSON.parse((row.nodes as string) || "[]"),
    edges: JSON.parse((row.edges as string) || "[]"),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastRunAt: (row.last_run_at as string) || undefined,
    runCount: (row.run_count as number) ?? 0,
    version: (row.version as number) ?? 0,
  };
}

// ── Legacy flat-file implementations ────────────────────────────

function legacyListWorkflows(): Workflow[] {
  legacyEnsureDir();
  const files = readdirSync(LEGACY_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(LEGACY_DIR, f), "utf-8")) as Workflow;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Workflow[];
}

function legacyGetWorkflow(id: string): Workflow | null {
  const filePath = join(LEGACY_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function legacySaveWorkflow(workflow: Workflow): void {
  legacyEnsureDir();
  writeFileSync(
    join(LEGACY_DIR, `${workflow.id}.json`),
    JSON.stringify(workflow, null, 2),
    "utf-8",
  );
}

function legacyDeleteWorkflow(id: string): boolean {
  const filePath = join(LEGACY_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}

function legacyUpdateRunStats(id: string, lastRunAt: string, runCount: number): void {
  const filePath = join(LEGACY_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return;
  }
  try {
    const workflow = JSON.parse(readFileSync(filePath, "utf-8"));
    workflow.lastRunAt = lastRunAt;
    workflow.runCount = runCount;
    writeFileSync(filePath, JSON.stringify(workflow, null, 2), "utf-8");
  } catch {
    // Non-critical
  }
}

function legacyToggleWorkflow(id: string): Workflow | null {
  const filePath = join(LEGACY_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const workflow = JSON.parse(readFileSync(filePath, "utf-8")) as Workflow;
    workflow.enabled = !workflow.enabled;
    workflow.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(workflow, null, 2), "utf-8");
    return workflow;
  } catch {
    return null;
  }
}

// ── Public API (dispatches to SQLite or legacy) ─────────────────

export function dalListWorkflows(): Workflow[] {
  if (isDatabaseAvailable()) {
    return dbListWorkflows(getDatabase());
  }
  return legacyListWorkflows();
}

export function dalGetWorkflow(id: string): Workflow | null {
  if (isDatabaseAvailable()) {
    return dbGetWorkflow(getDatabase(), id);
  }
  return legacyGetWorkflow(id);
}

export function dalSaveWorkflow(workflow: Workflow): void {
  if (isDatabaseAvailable()) {
    dbSaveWorkflow(getDatabase(), workflow);
  } else {
    legacySaveWorkflow(workflow);
  }
}

export function dalDeleteWorkflow(id: string): boolean {
  if (isDatabaseAvailable()) {
    return dbDeleteWorkflow(getDatabase(), id);
  }
  return legacyDeleteWorkflow(id);
}

export function dalUpdateRunStats(id: string, lastRunAt: string, runCount: number): void {
  if (isDatabaseAvailable()) {
    dbUpdateRunStats(getDatabase(), id, lastRunAt, runCount);
  } else {
    legacyUpdateRunStats(id, lastRunAt, runCount);
  }
}

export function dalToggleWorkflow(id: string): Workflow | null {
  if (isDatabaseAvailable()) {
    return dbToggleWorkflow(getDatabase(), id);
  }
  return legacyToggleWorkflow(id);
}
