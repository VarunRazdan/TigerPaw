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
): { executions: WorkflowExecution[]; total: number } {
  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM workflow_executions WHERE workflow_id = ?")
    .get(workflowId) as { cnt: number };

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const rows = db
    .prepare(
      "SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?",
    )
    .all(workflowId, limit, offset) as Array<Record<string, unknown>>;

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
): { executions: WorkflowExecution[]; total: number } {
  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM workflow_executions").get() as {
    cnt: number;
  };

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const rows = db
    .prepare("SELECT * FROM workflow_executions ORDER BY started_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Array<Record<string, unknown>>;

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

function legacyListExecutions(
  workflowId: string,
  opts?: { limit?: number; offset?: number },
): { executions: WorkflowExecution[]; total: number } {
  const dir = legacyRunDir(workflowId);
  if (!existsSync(dir)) {
    return { executions: [], total: 0 };
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
    .toSorted((a, b) => b.mtime - a.mtime);

  const total = files.length;
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const slice = files.slice(offset, offset + limit);

  const executions: WorkflowExecution[] = [];
  for (const file of slice) {
    try {
      executions.push(JSON.parse(readFileSync(join(dir, file.name), "utf-8")));
    } catch {
      /* skip corrupt */
    }
  }
  return { executions, total };
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

function legacyListAllExecutions(opts?: { limit?: number; offset?: number }): {
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
        all.push({ execution: JSON.parse(readFileSync(filePath, "utf-8")), mtime: stat.mtimeMs });
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
): { executions: WorkflowExecution[]; total: number } {
  if (isDatabaseAvailable()) {
    return dbListExecutions(getDatabase(), workflowId, opts);
  }
  return legacyListExecutions(workflowId, opts);
}

export function dalGetExecution(workflowId: string, executionId: string): WorkflowExecution | null {
  if (isDatabaseAvailable()) {
    return dbGetExecution(getDatabase(), workflowId, executionId);
  }
  return legacyGetExecution(workflowId, executionId);
}

export function dalListAllExecutions(opts?: { limit?: number; offset?: number }): {
  executions: WorkflowExecution[];
  total: number;
} {
  if (isDatabaseAvailable()) {
    return dbListAllExecutions(getDatabase(), opts);
  }
  return legacyListAllExecutions(opts);
}

export function dalClearHistory(workflowId: string): void {
  if (isDatabaseAvailable()) {
    dbClearHistory(getDatabase(), workflowId);
  } else {
    legacyClearHistory(workflowId);
  }
}
