/**
 * Singleton SQLite database connection for Tigerpaw data storage.
 *
 * Uses Node 22's built-in `node:sqlite` via the shared helper in
 * `src/memory/sqlite.ts`. The database file lives at `~/.tigerpaw/tigerpaw.db`
 * (or wherever `resolveStateDir()` points) with WAL mode for concurrent reads.
 */

import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { STATE_DIR } from "../config/paths.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

const DEFAULT_DB_NAME = "tigerpaw.db";

let db: DatabaseSync | null = null;
let dbPath: string | null = null;
let sqliteAvailable: boolean | null = null;

/**
 * Check whether `node:sqlite` is available in this runtime.
 * Caches the result after first call.
 */
export function isDatabaseAvailable(): boolean {
  if (sqliteAvailable === null) {
    try {
      requireNodeSqlite();
      sqliteAvailable = true;
    } catch {
      sqliteAvailable = false;
    }
  }
  return sqliteAvailable && db !== null;
}

/**
 * Resolve the database file path.
 * Respects `TIGERPAW_STATE_DIR` and other state dir overrides via `resolveStateDir()`.
 */
export function resolveDbPath(overridePath?: string): string {
  if (overridePath) {
    return overridePath;
  }
  return join(STATE_DIR, DEFAULT_DB_NAME);
}

/**
 * Get the singleton database connection, creating it on first call.
 * Throws if `node:sqlite` is unavailable.
 */
export function getDatabase(): DatabaseSync {
  if (db) {
    return db;
  }

  const { DatabaseSync: DbSync } = requireNodeSqlite();
  const resolvedPath = resolveDbPath();

  // Ensure state directory exists
  const dir = join(resolvedPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const isNew = !existsSync(resolvedPath);

  db = new DbSync(resolvedPath);
  dbPath = resolvedPath;

  // Set PRAGMAs for performance and safety
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  // Harden file permissions on new databases
  if (isNew) {
    try {
      chmodSync(resolvedPath, 0o600);
    } catch {
      // chmod may fail on Windows — non-fatal
    }
  }

  return db;
}

/**
 * Open a database at a specific path (for testing or custom paths).
 * Replaces the current singleton connection.
 */
export function openDatabase(path: string): DatabaseSync {
  closeDatabase();

  const { DatabaseSync: DbSync } = requireNodeSqlite();

  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new DbSync(path);
  dbPath = path;

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  return db;
}

/**
 * Close the database connection and clear the singleton.
 */
export function closeDatabase(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // Already closed or error — ignore
    }
    db = null;
    dbPath = null;
  }
}

/**
 * Get the path of the currently open database, or null if not open.
 */
export function getDatabasePath(): string | null {
  return dbPath;
}
