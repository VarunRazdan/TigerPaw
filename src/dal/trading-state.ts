/**
 * Trading Policy State DAL — SQLite-backed singleton state storage.
 *
 * Replaces flat-file I/O in `trading/policy-state.ts`.
 * The state is a single JSON blob in a single-row table.
 */

import type { DatabaseSync } from "node:sqlite";
import { getDatabase, isDatabaseAvailable } from "./database.js";

// ── SQLite implementations ──────────────────────────────────────

function dbLoadState(db: DatabaseSync): string | null {
  const row = db.prepare("SELECT state FROM trading_policy_state WHERE id = 1").get() as
    | { state: string }
    | undefined;
  return row?.state ?? null;
}

function dbSaveState(db: DatabaseSync, stateJson: string): void {
  db.prepare("INSERT OR REPLACE INTO trading_policy_state (id, state) VALUES (1, ?)").run(
    stateJson,
  );
}

// ── Public API ──────────────────────────────────────────────────

export function dalLoadPolicyStateJson(): string | null {
  if (isDatabaseAvailable()) {
    return dbLoadState(getDatabase());
  }
  return null;
}

export function dalSavePolicyStateJson(stateJson: string): void {
  if (isDatabaseAvailable()) {
    dbSaveState(getDatabase(), stateJson);
    return;
  }
  throw new Error("SQLite not available — caller should use legacy path");
}

export function dalIsTradingStateAvailable(): boolean {
  return isDatabaseAvailable();
}
