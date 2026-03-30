/**
 * Database schema management for Tigerpaw's SQLite data store.
 *
 * All tables are created idempotently via `ensureSchema()`. Schema versioning
 * tracks incremental upgrades for future migrations.
 */

import type { DatabaseSync } from "node:sqlite";

const CURRENT_SCHEMA_VERSION = 1;

/**
 * All table DDL statements for schema version 1.
 */
const SCHEMA_V1 = `
  -- Schema versioning
  CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL,
    description TEXT
  );

  -- Workflows
  CREATE TABLE IF NOT EXISTS workflows (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 0,
    nodes       TEXT NOT NULL,
    edges       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    last_run_at TEXT,
    run_count   INTEGER NOT NULL DEFAULT 0,
    version     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_workflows_enabled ON workflows(enabled);

  -- Workflow version snapshots (max 50 per workflow, auto-pruned)
  CREATE TABLE IF NOT EXISTS workflow_versions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id   TEXT NOT NULL,
    version       INTEGER NOT NULL,
    workflow_json TEXT NOT NULL,
    saved_at      TEXT NOT NULL,
    description   TEXT,
    UNIQUE(workflow_id, version)
  );
  CREATE INDEX IF NOT EXISTS idx_wfv_workflow_id ON workflow_versions(workflow_id);

  -- Execution history (max 100 per workflow, auto-pruned)
  CREATE TABLE IF NOT EXISTS workflow_executions (
    id                    TEXT NOT NULL,
    workflow_id           TEXT NOT NULL,
    workflow_name         TEXT NOT NULL,
    triggered_by          TEXT NOT NULL,
    trigger_data          TEXT,
    status                TEXT NOT NULL,
    started_at            INTEGER NOT NULL,
    completed_at          INTEGER,
    duration_ms           INTEGER,
    node_results          TEXT NOT NULL,
    error                 TEXT,
    parent_execution_id   TEXT,
    PRIMARY KEY (workflow_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_wfe_started_at ON workflow_executions(started_at);

  -- Credentials (encrypted fields preserved as-is)
  CREATE TABLE IF NOT EXISTS credentials (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    fields      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(type);

  -- Trading audit log (HMAC chain preserved)
  CREATE TABLE IF NOT EXISTS trading_audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL,
    extension_id    TEXT NOT NULL,
    action          TEXT NOT NULL,
    actor           TEXT NOT NULL,
    order_snapshot  TEXT,
    policy_snapshot TEXT,
    error           TEXT,
    prev_hash       TEXT NOT NULL,
    hmac            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tal_timestamp ON trading_audit_log(timestamp);

  -- Trading policy state (singleton row)
  CREATE TABLE IF NOT EXISTS trading_policy_state (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL
  );
`;

/**
 * Get the current schema version from the database.
 * Returns 0 if the schema_version table doesn't exist yet.
 */
export function getSchemaVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as
      | { version: number | null }
      | undefined;
    return row?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Create all tables and indexes if they don't exist.
 * Records the schema version for future upgrade tracking.
 */
export function ensureSchema(db: DatabaseSync): void {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return; // Already up to date
  }

  // Apply schema v1
  if (currentVersion < 1) {
    db.exec(SCHEMA_V1);

    db.prepare(
      "INSERT OR IGNORE INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)",
    ).run(1, new Date().toISOString(), "Initial schema — workflows, credentials, trading data");
  }

  // Future versions would go here:
  // if (currentVersion < 2) { db.exec(SCHEMA_V2); ... }
}
