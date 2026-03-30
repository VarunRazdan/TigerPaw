/**
 * Trading Audit Log DAL — SQLite-backed audit entry storage.
 *
 * HMAC chain computation stays in the caller (`trading/audit-log.ts`).
 * This module just stores and retrieves entries.
 */

import type { DatabaseSync } from "node:sqlite";
import { getDatabase, isDatabaseAvailable } from "./database.js";

export type AuditEntryRow = {
  timestamp: string;
  extensionId: string;
  action: string;
  actor: string;
  orderSnapshot?: string | null;
  policySnapshot?: string | null;
  error?: string | null;
  prevHash: string;
  hmac: string;
};

// ── SQLite implementations ──────────────────────────────────────

function dbAppendEntry(db: DatabaseSync, entry: AuditEntryRow): void {
  db.prepare(`
    INSERT INTO trading_audit_log
      (timestamp, extension_id, action, actor, order_snapshot, policy_snapshot, error, prev_hash, hmac)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.timestamp,
    entry.extensionId,
    entry.action,
    entry.actor,
    entry.orderSnapshot ?? null,
    entry.policySnapshot ?? null,
    entry.error ?? null,
    entry.prevHash,
    entry.hmac,
  );
}

function dbReadEntries(db: DatabaseSync): AuditEntryRow[] {
  const rows = db.prepare("SELECT * FROM trading_audit_log ORDER BY id ASC").all() as Array<
    Record<string, unknown>
  >;

  return rows.map((row) => ({
    timestamp: row.timestamp as string,
    extensionId: row.extension_id as string,
    action: row.action as string,
    actor: row.actor as string,
    orderSnapshot: (row.order_snapshot as string) || null,
    policySnapshot: (row.policy_snapshot as string) || null,
    error: (row.error as string) || null,
    prevHash: row.prev_hash as string,
    hmac: row.hmac as string,
  }));
}

function dbGetLastEntryJson(db: DatabaseSync): string | null {
  const row = db.prepare("SELECT * FROM trading_audit_log ORDER BY id DESC LIMIT 1").get() as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    return null;
  }

  // Reconstruct the JSON as it was originally serialized (for hash continuity)
  const entry = {
    timestamp: row.timestamp,
    extensionId: row.extension_id,
    action: row.action,
    actor: row.actor,
    ...(row.order_snapshot ? { orderSnapshot: JSON.parse(row.order_snapshot as string) } : {}),
    ...(row.policy_snapshot ? { policySnapshot: JSON.parse(row.policy_snapshot as string) } : {}),
    ...(row.error ? { error: row.error } : {}),
    prevHash: row.prev_hash,
    hmac: row.hmac,
  };

  return JSON.stringify(entry);
}

function dbCountEntries(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM trading_audit_log").get() as { cnt: number };
  return row.cnt;
}

// ── Public API ──────────────────────────────────────────────────

export function dalAppendAuditEntry(entry: AuditEntryRow): void {
  if (isDatabaseAvailable()) {
    dbAppendEntry(getDatabase(), entry);
    return;
  }
  // Legacy path handled by caller (audit-log.ts retains file-based fallback)
  throw new Error("SQLite not available — caller should use legacy path");
}

export function dalReadAuditEntries(): AuditEntryRow[] {
  if (isDatabaseAvailable()) {
    return dbReadEntries(getDatabase());
  }
  return [];
}

export function dalGetLastAuditEntryJson(): string | null {
  if (isDatabaseAvailable()) {
    return dbGetLastEntryJson(getDatabase());
  }
  return null;
}

export function dalCountAuditEntries(): number {
  if (isDatabaseAvailable()) {
    return dbCountEntries(getDatabase());
  }
  return 0;
}

export function dalIsAuditAvailable(): boolean {
  return isDatabaseAvailable();
}
