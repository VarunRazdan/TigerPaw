/**
 * Database initialization — called once at gateway startup.
 *
 * Opens the database, ensures the schema exists, and runs the one-time
 * flat-file migration if needed.
 */

import { STATE_DIR } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getDatabase, isDatabaseAvailable, resolveDbPath } from "./database.js";
import { migrateFromFlatFiles, needsMigration } from "./migration.js";
import { ensureSchema } from "./schema.js";

const log = createSubsystemLogger("dal/init");

/**
 * Initialize the SQLite database. Safe to call multiple times (idempotent).
 * Throws if `node:sqlite` is unavailable — caller should catch and log.
 */
export function initDatabase(): void {
  if (!isDatabaseAvailable()) {
    log.info("node:sqlite not available — using legacy flat-file storage");
    return;
  }

  const dbPath = resolveDbPath();
  log.info(`Opening database at ${dbPath}`);

  const db = getDatabase();
  ensureSchema(db);

  // Run one-time migration from flat files if this is a fresh database
  if (needsMigration(STATE_DIR)) {
    log.info("Detected existing flat-file data — running migration to SQLite");
    const result = migrateFromFlatFiles(db, STATE_DIR);

    if (result.migrated) {
      log.info(
        `Migration successful: ${result.counts.workflows} workflows, ` +
          `${result.counts.versions} versions, ${result.counts.executions} executions, ` +
          `${result.counts.credentials} credentials, ${result.counts.auditEntries} audit entries`,
      );
    }

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        log.warn(`Migration warning: ${err}`);
      }
    }
  }
}
