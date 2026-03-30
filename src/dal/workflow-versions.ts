/**
 * Workflow Version DAL — SQLite-backed version snapshot storage.
 *
 * Replaces flat-file I/O in `workflows/versioning.ts`.
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
import type { Workflow, WorkflowVersion } from "../workflows/types.js";
import { getDatabase, isDatabaseAvailable } from "./database.js";

const LEGACY_DIR = join(homedir(), ".tigerpaw", "workflow-versions");
const MAX_VERSIONS = 50;

// ── SQLite implementations ──────────────────────────────────────

function dbSaveVersion(db: DatabaseSync, workflow: Workflow, description?: string): number {
  // Get next version number
  const maxRow = db
    .prepare("SELECT MAX(version) as maxV FROM workflow_versions WHERE workflow_id = ?")
    .get(workflow.id) as { maxV: number | null } | undefined;
  const nextVersion = (maxRow?.maxV ?? 0) + 1;

  db.prepare(`
    INSERT INTO workflow_versions (workflow_id, version, workflow_json, saved_at, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    workflow.id,
    nextVersion,
    JSON.stringify(workflow),
    new Date().toISOString(),
    description ?? null,
  );

  // Prune excess versions
  dbPruneVersions(db, workflow.id);

  return nextVersion;
}

function dbListVersions(
  db: DatabaseSync,
  workflowId: string,
  opts?: { limit?: number; offset?: number },
): {
  versions: Array<{
    version: number;
    savedAt: string;
    description?: string;
    nodeCount: number;
    edgeCount: number;
  }>;
  total: number;
} {
  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM workflow_versions WHERE workflow_id = ?")
    .get(workflowId) as { cnt: number };
  const total = countRow.cnt;

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const rows = db
    .prepare(
      "SELECT version, workflow_json, saved_at, description FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC LIMIT ? OFFSET ?",
    )
    .all(workflowId, limit, offset) as Array<Record<string, unknown>>;

  const versions = rows.map((row) => {
    const wf = JSON.parse(row.workflow_json as string) as Workflow;
    return {
      version: row.version as number,
      savedAt: row.saved_at as string,
      description: (row.description as string) || undefined,
      nodeCount: wf.nodes?.length ?? 0,
      edgeCount: wf.edges?.length ?? 0,
    };
  });

  return { versions, total };
}

function dbGetVersion(
  db: DatabaseSync,
  workflowId: string,
  version: number,
): WorkflowVersion | null {
  const row = db
    .prepare(
      "SELECT version, workflow_json, saved_at, description FROM workflow_versions WHERE workflow_id = ? AND version = ?",
    )
    .get(workflowId, version) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return {
    version: row.version as number,
    workflow: JSON.parse(row.workflow_json as string),
    savedAt: row.saved_at as string,
    description: (row.description as string) || undefined,
  };
}

function dbClearVersionHistory(db: DatabaseSync, workflowId: string): void {
  db.prepare("DELETE FROM workflow_versions WHERE workflow_id = ?").run(workflowId);
}

function dbPruneVersions(db: DatabaseSync, workflowId: string): void {
  db.prepare(`
    DELETE FROM workflow_versions
    WHERE workflow_id = ? AND id NOT IN (
      SELECT id FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC LIMIT ?
    )
  `).run(workflowId, workflowId, MAX_VERSIONS);
}

// ── Legacy flat-file implementations ────────────────────────────

function legacyEnsureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function legacyVersionDir(workflowId: string): string {
  return join(LEGACY_DIR, workflowId);
}

function legacySaveVersion(workflow: Workflow, description?: string): number {
  const dir = legacyVersionDir(workflow.id);
  legacyEnsureDir(dir);

  const existing = legacyListVersionNumbers(dir);
  const nextVersion = existing.length > 0 ? Math.max(...existing) + 1 : 1;

  const snapshot: WorkflowVersion = {
    version: nextVersion,
    workflow: structuredClone(workflow),
    savedAt: new Date().toISOString(),
    description,
  };

  writeFileSync(join(dir, `v${nextVersion}.json`), JSON.stringify(snapshot, null, 2), "utf-8");
  legacyPruneVersions(dir);
  return nextVersion;
}

function legacyListVersionNumbers(dir: string): number[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.startsWith("v") && f.endsWith(".json"))
    .map((f) => parseInt(f.slice(1, -5), 10))
    .filter((n) => !isNaN(n));
}

function legacyListVersions(
  workflowId: string,
  opts?: { limit?: number; offset?: number },
): {
  versions: Array<{
    version: number;
    savedAt: string;
    description?: string;
    nodeCount: number;
    edgeCount: number;
  }>;
  total: number;
} {
  const dir = legacyVersionDir(workflowId);
  if (!existsSync(dir)) {
    return { versions: [], total: 0 };
  }

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("v") && f.endsWith(".json"))
    .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
    .toSorted((a, b) => b.mtime - a.mtime);

  const total = files.length;
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const slice = files.slice(offset, offset + limit);

  const versions = slice
    .map((file) => {
      try {
        const raw: WorkflowVersion = JSON.parse(readFileSync(join(dir, file.name), "utf-8"));
        return {
          version: raw.version,
          savedAt: raw.savedAt,
          description: raw.description,
          nodeCount: raw.workflow.nodes?.length ?? 0,
          edgeCount: raw.workflow.edges?.length ?? 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<{
    version: number;
    savedAt: string;
    description?: string;
    nodeCount: number;
    edgeCount: number;
  }>;

  return { versions, total };
}

function legacyGetVersion(workflowId: string, version: number): WorkflowVersion | null {
  const filePath = join(legacyVersionDir(workflowId), `v${version}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function legacyClearVersionHistory(workflowId: string): void {
  const dir = legacyVersionDir(workflowId);
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

function legacyPruneVersions(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("v") && f.endsWith(".json"))
    .map((f) => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
    .toSorted((a, b) => a.mtime - b.mtime);
  const excess = files.length - MAX_VERSIONS;
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

export function dalSaveVersion(workflow: Workflow, description?: string): number {
  if (isDatabaseAvailable()) {
    return dbSaveVersion(getDatabase(), workflow, description);
  }
  return legacySaveVersion(workflow, description);
}

export function dalListVersions(workflowId: string, opts?: { limit?: number; offset?: number }) {
  if (isDatabaseAvailable()) {
    return dbListVersions(getDatabase(), workflowId, opts);
  }
  return legacyListVersions(workflowId, opts);
}

export function dalGetVersion(workflowId: string, version: number): WorkflowVersion | null {
  if (isDatabaseAvailable()) {
    return dbGetVersion(getDatabase(), workflowId, version);
  }
  return legacyGetVersion(workflowId, version);
}

export function dalClearVersionHistory(workflowId: string): void {
  if (isDatabaseAvailable()) {
    dbClearVersionHistory(getDatabase(), workflowId);
  } else {
    legacyClearVersionHistory(workflowId);
  }
}
