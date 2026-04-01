/**
 * Workflow Execution History DAL — SQLite-backed execution log.
 *
 * Replaces flat-file I/O in `workflows/history.ts`.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// ── Legacy imports (fallback) ───────────────────────────────────
import type { DatabaseSync } from "node:sqlite";
import type { WorkflowExecution } from "../workflows/types.js";
import { getDatabase, isDatabaseAvailable } from "./database.js";

export type ExecutionFilter = {
  status?: string; // "completed" | "failed" | "running" | "cancelled"
  dateFrom?: number; // epoch ms — filter startedAt >= dateFrom
  dateTo?: number; // epoch ms — filter startedAt <= dateTo
  triggeredBy?: string; // trigger node ID or "manual"
};

const LEGACY_DIR = join(homedir(), ".tigerpaw", "workflow-runs");
const MAX_RUNS = 100;

// ── SQLite implementations ──────────────────────────────────────

function dbSaveExecution(db: DatabaseSync, execution: WorkflowExecution): void {
  db.prepare(`
    INSERT OR REPLACE INTO workflow_executions
      (id, workflow_id, workflow_name, triggered_by, trigger_data, status,
       started_at, completed_at, duration_ms, node_results, error, parent_execution_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    execution.id,
    execution.workflowId,
    execution.workflowName,
    execution.triggeredBy,
    execution.triggerData ? JSON.stringify(execution.triggerData) : null,
    execution.status,
    execution.startedAt,
    execution.completedAt ?? null,
    execution.durationMs ?? null,
    JSON.stringify(execution.nodeResults),
    execution.error ?? null,
    execution.parentExecutionId ?? null,
  );

  // Prune excess runs
  dbPruneRuns(db, execution.workflowId);
}

function dbListExecutions(
  db: DatabaseSync,
  workflowId: string,
  opts?: { limit?: number; offset?: number },
  filters?: ExecutionFilter,
): { executions: WorkflowExecution[]; total: number } {
  const conditions = ["workflow_id = ?"];
  const params: (string | number)[] = [workflowId];

  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.dateFrom != null) {
    conditions.push("started_at >= ?");
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo != null) {
    conditions.push("started_at <= ?");
    params.push(filters.dateTo);
  }
  if (filters?.triggeredBy) {
    conditions.push("triggered_by = ?");
    params.push(filters.triggeredBy);
  }

  const where = conditions.join(" AND ");
  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM workflow_executions WHERE ${where}`)
    .get(...params) as { cnt: number };

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const rows = db
    .prepare(
      `SELECT * FROM workflow_executions WHERE ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return { executions: rows.map(rowToExecution), total: countRow.cnt };
}

function dbGetExecution(
  db: DatabaseSync,
  workflowId: string,
  executionId: string,
): WorkflowExecution | null {
  const row = db
    .prepare("SELECT * FROM workflow_executions WHERE workflow_id = ? AND id = ?")
    .get(workflowId, executionId) as Record<string, unknown> | undefined;
  return row ? rowToExecution(row) : null;
}

function dbListAllExecutions(
  db: DatabaseSync,
  opts?: { limit?: number; offset?: number },
  filters?: ExecutionFilter,
): { executions: WorkflowExecution[]; total: number } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.dateFrom != null) {
    conditions.push("started_at >= ?");
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo != null) {
    conditions.push("started_at <= ?");
    params.push(filters.dateTo);
  }
  if (filters?.triggeredBy) {
    conditions.push("triggered_by = ?");
    params.push(filters.triggeredBy);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM workflow_executions ${where}`)
    .get(...params) as { cnt: number };

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const rows = db
    .prepare(`SELECT * FROM workflow_executions ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return { executions: rows.map(rowToExecution), total: countRow.cnt };
}

function dbClearHistory(db: DatabaseSync, workflowId: string): void {
  db.prepare("DELETE FROM workflow_executions WHERE workflow_id = ?").run(workflowId);
}

function dbPruneRuns(db: DatabaseSync, workflowId: string): void {
  db.prepare(`
    DELETE FROM workflow_executions
    WHERE workflow_id = ? AND rowid NOT IN (
      SELECT rowid FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?
    )
  `).run(workflowId, workflowId, MAX_RUNS);
}

function rowToExecution(row: Record<string, unknown>): WorkflowExecution {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    workflowName: row.workflow_name as string,
    triggeredBy: row.triggered_by as string,
    triggerData: row.trigger_data ? JSON.parse(row.trigger_data as string) : undefined,
    status: row.status as WorkflowExecution["status"],
    startedAt: row.started_at as number,
    completedAt: (row.completed_at as number) || undefined,
    durationMs: (row.duration_ms as number) || undefined,
    nodeResults: JSON.parse((row.node_results as string) || "[]"),
    error: (row.error as string) || undefined,
    parentExecutionId: (row.parent_execution_id as string) || undefined,
  };
}

// ── Legacy flat-file implementations ────────────────────────────

function legacyEnsureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function legacyRunDir(workflowId: string): string {
  return join(LEGACY_DIR, workflowId);
}

function legacySaveExecution(execution: WorkflowExecution): void {
  const dir = legacyRunDir(execution.workflowId);
  legacyEnsureDir(dir);
  writeFileSync(join(dir, `${execution.id}.json`), JSON.stringify(execution, null, 2), "utf-8");
  legacyPruneRuns(dir);
}

function legacyMatchesFilter(exec: WorkflowExecution, filters?: ExecutionFilter): boolean {
  if (!filters) {
    return true;
  }
  if (filters.status && exec.status !== filters.status) {
    return false;
  }
  if (filters.dateFrom != null && exec.startedAt < filters.dateFrom) {
    return false;
  }
  if (filters.dateTo != null && exec.startedAt > filters.dateTo) {
    return false;
  }
  if (filters.triggeredBy && exec.triggeredBy !== filters.triggeredBy) {
    return false;
  }
  return true;
}

function legacyListExecutions(
  workflowId: string,
  opts?: { limit?: number; offset?: number },
  filters?: ExecutionFilter,
): { executions: WorkflowExecution[]; total: number } {
  const dir = legacyRunDir(workflowId);
  if (!existsSync(dir)) {
    return { executions: [], total: 0 };
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
    .toSorted((a, b) => b.mtime - a.mtime);

  // Read all files and apply filters
  const allExecutions: WorkflowExecution[] = [];
  for (const file of files) {
    try {
      const exec: WorkflowExecution = JSON.parse(readFileSync(join(dir, file.name), "utf-8"));
      if (legacyMatchesFilter(exec, filters)) {
        allExecutions.push(exec);
      }
    } catch {
      /* skip corrupt */
    }
  }

  const total = allExecutions.length;
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  return { executions: allExecutions.slice(offset, offset + limit), total };
}

function legacyGetExecution(workflowId: string, executionId: string): WorkflowExecution | null {
  const filePath = join(legacyRunDir(workflowId), `${executionId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function legacyListAllExecutions(
  opts?: { limit?: number; offset?: number },
  filters?: ExecutionFilter,
): {
  executions: WorkflowExecution[];
  total: number;
} {
  legacyEnsureDir(LEGACY_DIR);
  const all: { execution: WorkflowExecution; mtime: number }[] = [];

  const workflowDirs = readdirSync(LEGACY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const wfId of workflowDirs) {
    const dir = join(LEGACY_DIR, wfId);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        const exec: WorkflowExecution = JSON.parse(readFileSync(filePath, "utf-8"));
        if (legacyMatchesFilter(exec, filters)) {
          all.push({ execution: exec, mtime: stat.mtimeMs });
        }
      } catch {
        /* skip */
      }
    }
  }

  all.sort((a, b) => b.mtime - a.mtime);
  const total = all.length;
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  return { executions: all.slice(offset, offset + limit).map((s) => s.execution), total };
}

function legacyClearHistory(workflowId: string): void {
  const dir = legacyRunDir(workflowId);
  if (!existsSync(dir)) {
    return;
  }
  for (const file of readdirSync(dir)) {
    try {
      unlinkSync(join(dir, file));
    } catch {
      /* ignore */
    }
  }
}

function legacyPruneRuns(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
    .toSorted((a, b) => a.mtime - b.mtime);
  const excess = files.length - MAX_RUNS;
  if (excess <= 0) {
    return;
  }
  for (let i = 0; i < excess; i++) {
    try {
      unlinkSync(join(dir, files[i].name));
    } catch {
      /* ignore */
    }
  }
}

// ── Public API ──────────────────────────────────────────────────

export function dalSaveExecution(execution: WorkflowExecution): void {
  if (isDatabaseAvailable()) {
    dbSaveExecution(getDatabase(), execution);
  } else {
    legacySaveExecution(execution);
  }
}

export function dalListExecutions(
  workflowId: string,
  opts?: { limit?: number; offset?: number },
  filters?: ExecutionFilter,
): { executions: WorkflowExecution[]; total: number } {
  if (isDatabaseAvailable()) {
    return dbListExecutions(getDatabase(), workflowId, opts, filters);
  }
  return legacyListExecutions(workflowId, opts, filters);
}

export function dalGetExecution(workflowId: string, executionId: string): WorkflowExecution | null {
  if (isDatabaseAvailable()) {
    return dbGetExecution(getDatabase(), workflowId, executionId);
  }
  return legacyGetExecution(workflowId, executionId);
}

export function dalListAllExecutions(
  opts?: { limit?: number; offset?: number },
  filters?: ExecutionFilter,
): {
  executions: WorkflowExecution[];
  total: number;
} {
  if (isDatabaseAvailable()) {
    return dbListAllExecutions(getDatabase(), opts, filters);
  }
  return legacyListAllExecutions(opts, filters);
}

export function dalClearHistory(workflowId: string): void {
  if (isDatabaseAvailable()) {
    dbClearHistory(getDatabase(), workflowId);
  } else {
    legacyClearHistory(workflowId);
  }
}
