/**
 * Data Access Layer (DAL) — SQLite-backed storage for Tigerpaw.
 *
 * Provides a clean interface over the SQLite database, replacing flat-file
 * JSON storage for workflows, credentials, execution history, and trading data.
 */

export {
  closeDatabase,
  getDatabase,
  getDatabasePath,
  isDatabaseAvailable,
  openDatabase,
  resolveDbPath,
} from "./database.js";
export { ensureSchema, getSchemaVersion } from "./schema.js";
export { initDatabase } from "./init.js";
export { migrateFromFlatFiles, needsMigration, type MigrationResult } from "./migration.js";
export {
  dalListWorkflows,
  dalGetWorkflow,
  dalSaveWorkflow,
  dalDeleteWorkflow,
  dalUpdateRunStats,
  dalToggleWorkflow,
} from "./workflows.js";
export {
  dalSaveVersion,
  dalListVersions,
  dalGetVersion,
  dalClearVersionHistory,
} from "./workflow-versions.js";
export {
  dalSaveExecution,
  dalListExecutions,
  dalGetExecution,
  dalListAllExecutions,
  dalClearHistory,
} from "./workflow-history.js";
export {
  dalListCredentials,
  dalGetCredentialRaw,
  dalSaveCredentialRaw,
  dalDeleteCredential,
  dalFindByType,
} from "./credentials.js";
export {
  dalAppendAuditEntry,
  dalReadAuditEntries,
  dalGetLastAuditEntryJson,
  dalCountAuditEntries,
  dalIsAuditAvailable,
  type AuditEntryRow,
} from "./trading-audit.js";
export {
  dalLoadPolicyStateJson,
  dalSavePolicyStateJson,
  dalIsTradingStateAvailable,
} from "./trading-state.js";
