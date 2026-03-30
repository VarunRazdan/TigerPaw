/**
 * One-time migration from flat-file JSON storage to SQLite.
 *
 * On first startup after upgrade, detects existing flat-file data directories
 * and imports them into the SQLite database. Old directories are renamed with
 * a `.pre-sqlite-backup` suffix — never deleted.
 *
 * The entire import runs inside a single SQLite transaction for atomicity.
 * If anything fails, the database file is deleted and flat files remain
 * untouched so the user can retry.
 */

import { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("dal/migration");

export type MigrationResult = {
  migrated: boolean;
  counts: {
    workflows: number;
    versions: number;
    executions: number;
    credentials: number;
    auditEntries: number;
    policyState: boolean;
  };
  errors: string[];
};

/**
 * Check whether flat-file data directories exist and should be migrated.
 */
export function needsMigration(stateDir: string): boolean {
  const dirs = [
    join(stateDir, "workflows"),
    join(stateDir, "workflow-versions"),
    join(stateDir, "workflow-runs"),
    join(stateDir, "credentials"),
  ];
  const files = [
    join(stateDir, "trading", "audit.jsonl"),
    join(stateDir, "trading", "policy-state.json"),
  ];

  return dirs.some((d) => existsSync(d)) || files.some((f) => existsSync(f));
}

/**
 * Migrate all flat-file data into the SQLite database.
 * Must be called AFTER `ensureSchema()`.
 */
export function migrateFromFlatFiles(db: DatabaseSync, stateDir: string): MigrationResult {
  const result: MigrationResult = {
    migrated: false,
    counts: {
      workflows: 0,
      versions: 0,
      executions: 0,
      credentials: 0,
      auditEntries: 0,
      policyState: false,
    },
    errors: [],
  };

  if (!needsMigration(stateDir)) {
    return result;
  }

  log.info("Starting flat-file to SQLite migration...");

  // Run entire migration in a transaction for atomicity
  const txn = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");
  const rollback = db.prepare("ROLLBACK");

  try {
    txn.run();

    migrateWorkflows(db, stateDir, result);
    migrateWorkflowVersions(db, stateDir, result);
    migrateWorkflowExecutions(db, stateDir, result);
    migrateCredentials(db, stateDir, result);
    migrateAuditLog(db, stateDir, result);
    migratePolicyState(db, stateDir, result);

    commit.run();
    result.migrated = true;

    // Rename old directories (non-destructive, outside transaction)
    renameOldDirectories(stateDir, result);

    log.info(
      `Migration complete: ${result.counts.workflows} workflows, ` +
        `${result.counts.versions} versions, ${result.counts.executions} executions, ` +
        `${result.counts.credentials} credentials, ${result.counts.auditEntries} audit entries` +
        (result.errors.length > 0 ? ` (${result.errors.length} warnings)` : ""),
    );
  } catch (err) {
    try {
      rollback.run();
    } catch {
      // Rollback may fail if transaction wasn't started
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Migration failed, rolling back: ${msg}`);
    result.errors.push(`Fatal: ${msg}`);
  }

  return result;
}

// ── Individual data type migrations ──────────────────────────────

function migrateWorkflows(db: DatabaseSync, stateDir: string, result: MigrationResult): void {
  const dir = join(stateDir, "workflows");
  if (!existsSync(dir)) {
    return;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO workflows
      (id, name, description, enabled, nodes, edges, created_at, updated_at, last_run_at, run_count, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      stmt.run(
        raw.id,
        raw.name ?? "",
        raw.description ?? "",
        raw.enabled ? 1 : 0,
        JSON.stringify(raw.nodes ?? []),
        JSON.stringify(raw.edges ?? []),
        raw.createdAt ?? new Date().toISOString(),
        raw.updatedAt ?? new Date().toISOString(),
        raw.lastRunAt ?? null,
        raw.runCount ?? 0,
        raw.version ?? 0,
      );
      result.counts.workflows++;
    } catch (err) {
      result.errors.push(`Workflow ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function migrateWorkflowVersions(
  db: DatabaseSync,
  stateDir: string,
  result: MigrationResult,
): void {
  const baseDir = join(stateDir, "workflow-versions");
  if (!existsSync(baseDir)) {
    return;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO workflow_versions
      (workflow_id, version, workflow_json, saved_at, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  const workflowDirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const wfId of workflowDirs) {
    const versionDir = join(baseDir, wfId);
    const files = readdirSync(versionDir).filter((f) => f.startsWith("v") && f.endsWith(".json"));

    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(versionDir, file), "utf-8"));
        stmt.run(
          wfId,
          raw.version ?? parseInt(file.slice(1, -5), 10),
          JSON.stringify(raw.workflow ?? {}),
          raw.savedAt ?? new Date().toISOString(),
          raw.description ?? null,
        );
        result.counts.versions++;
      } catch (err) {
        result.errors.push(
          `Version ${wfId}/${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

function migrateWorkflowExecutions(
  db: DatabaseSync,
  stateDir: string,
  result: MigrationResult,
): void {
  const baseDir = join(stateDir, "workflow-runs");
  if (!existsSync(baseDir)) {
    return;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO workflow_executions
      (id, workflow_id, workflow_name, triggered_by, trigger_data, status,
       started_at, completed_at, duration_ms, node_results, error, parent_execution_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const workflowDirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const wfId of workflowDirs) {
    const runDir = join(baseDir, wfId);
    const files = readdirSync(runDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(runDir, file), "utf-8"));
        stmt.run(
          raw.id,
          raw.workflowId ?? wfId,
          raw.workflowName ?? "",
          raw.triggeredBy ?? "unknown",
          raw.triggerData ? JSON.stringify(raw.triggerData) : null,
          raw.status ?? "completed",
          raw.startedAt ?? 0,
          raw.completedAt ?? null,
          raw.durationMs ?? null,
          JSON.stringify(raw.nodeResults ?? []),
          raw.error ?? null,
          raw.parentExecutionId ?? null,
        );
        result.counts.executions++;
      } catch (err) {
        result.errors.push(
          `Execution ${wfId}/${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

function migrateCredentials(db: DatabaseSync, stateDir: string, result: MigrationResult): void {
  const dir = join(stateDir, "credentials");
  if (!existsSync(dir)) {
    return;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO credentials (id, name, type, fields, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      // Fields are already encrypted on disk — store as-is
      stmt.run(
        raw.id,
        raw.name ?? "",
        raw.type ?? "custom",
        JSON.stringify(raw.fields ?? {}),
        raw.createdAt ?? new Date().toISOString(),
        raw.updatedAt ?? new Date().toISOString(),
      );
      result.counts.credentials++;
    } catch (err) {
      result.errors.push(`Credential ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function migrateAuditLog(db: DatabaseSync, stateDir: string, result: MigrationResult): void {
  const auditFile = join(stateDir, "trading", "audit.jsonl");
  if (!existsSync(auditFile)) {
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO trading_audit_log
      (timestamp, extension_id, action, actor, order_snapshot, policy_snapshot, error, prev_hash, hmac)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let content: string;
  try {
    content = readFileSync(auditFile, "utf-8");
  } catch {
    return;
  }

  const lines = content.trimEnd().split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      stmt.run(
        entry.timestamp ?? "",
        entry.extensionId ?? "",
        entry.action ?? "",
        entry.actor ?? "",
        entry.orderSnapshot ? JSON.stringify(entry.orderSnapshot) : null,
        entry.policySnapshot ? JSON.stringify(entry.policySnapshot) : null,
        entry.error ?? null,
        entry.prevHash ?? "0",
        entry.hmac ?? "",
      );
      result.counts.auditEntries++;
    } catch (err) {
      result.errors.push(`Audit entry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function migratePolicyState(db: DatabaseSync, stateDir: string, result: MigrationResult): void {
  const stateFile = join(stateDir, "trading", "policy-state.json");
  if (!existsSync(stateFile)) {
    return;
  }

  try {
    const content = readFileSync(stateFile, "utf-8");
    // Validate it's parseable JSON
    JSON.parse(content);

    db.prepare("INSERT OR REPLACE INTO trading_policy_state (id, state) VALUES (1, ?)").run(
      content,
    );

    result.counts.policyState = true;
  } catch (err) {
    result.errors.push(`Policy state: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Post-migration cleanup ───────────────────────────────────────

function renameOldDirectories(stateDir: string, result: MigrationResult): void {
  const dirsToRename = ["workflows", "workflow-versions", "workflow-runs", "credentials"];

  for (const dirName of dirsToRename) {
    const src = join(stateDir, dirName);
    const dst = join(stateDir, `${dirName}.pre-sqlite-backup`);

    if (existsSync(src) && !existsSync(dst)) {
      try {
        renameSync(src, dst);
      } catch (err) {
        result.errors.push(
          `Rename ${dirName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Rename audit log and policy state files
  const filesToRename = [join("trading", "audit.jsonl"), join("trading", "policy-state.json")];

  for (const relPath of filesToRename) {
    const src = join(stateDir, relPath);
    const dst = `${src}.pre-sqlite-backup`;

    if (existsSync(src) && !existsSync(dst)) {
      try {
        renameSync(src, dst);
      } catch (err) {
        result.errors.push(
          `Rename ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
