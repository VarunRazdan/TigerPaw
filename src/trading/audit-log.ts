import { createHash, createHmac, randomBytes } from "node:crypto";
import * as fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  dalAppendAuditEntry,
  dalGetLastAuditEntryJson,
  dalIsAuditAvailable,
  dalReadAuditEntries,
  type AuditEntryRow,
} from "../dal/trading-audit.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { withFileLock } from "../plugin-sdk/file-lock.js";
import type { TradeOrder } from "./policy-engine.js";
import type { TradingPolicyConfig } from "./policy-engine.js";

const log = createSubsystemLogger("trading/audit-log");

const DEFAULT_AUDIT_DIR = path.join(os.homedir(), ".tigerpaw", "trading");
const DEFAULT_AUDIT_FILE = path.join(DEFAULT_AUDIT_DIR, "audit.jsonl");
const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_ROTATE_COUNT = 5;

/**
 * Resolve the HMAC key for audit log integrity.
 */
function resolveHmacKey(): string {
  const envKey = process.env.TIGERPAW_AUDIT_HMAC_KEY;
  if (envKey && envKey.length > 0) {
    return envKey;
  }

  const keyPath = path.join(DEFAULT_AUDIT_DIR, ".audit-hmac-key");
  try {
    const existing = fsSync.readFileSync(keyPath, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch {
    // Key file does not exist yet — generate one.
  }

  const key = randomBytes(32).toString("hex");
  try {
    fsSync.mkdirSync(DEFAULT_AUDIT_DIR, { recursive: true, mode: 0o700 });
    fsSync.writeFileSync(keyPath, key, { mode: 0o600, encoding: "utf8" });
  } catch (err) {
    log.warn(`failed to persist audit HMAC key: ${String(err)}`);
  }
  return key;
}

/** Cryptographically random HMAC key for audit log tamper evidence. */
const HMAC_KEY = resolveHmacKey();

const LOCK_OPTIONS = {
  retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
  stale: 10_000,
};

export type AuditAction =
  | "order_requested"
  | "auto_approved"
  | "manually_approved"
  | "denied"
  | "submitted"
  | "filled"
  | "rejected"
  | "cancelled"
  | "kill_switch_activated"
  | "limit_exceeded"
  | "policy_changed";

export type AuditActor = "agent" | "operator" | "system";

export type AuditLogEntry = {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Extension that originated the trade request. */
  extensionId: string;
  /** What happened. */
  action: AuditAction;
  /** Who triggered the action. */
  actor: AuditActor;
  /** Snapshot of the trade order at this point (if applicable). */
  orderSnapshot?: TradeOrder;
  /** Snapshot of the active policy at this point (if applicable). */
  policySnapshot?: TradingPolicyConfig;
  /** Error message if the action failed. */
  error?: string;
  /** SHA-256 of the previous entry, forming an integrity chain. */
  prevHash: string;
  /** HMAC-SHA256 of this entry (excluding the hmac field itself), providing tamper evidence. */
  hmac: string;
};

type AuditLogConfig = {
  filePath: string;
  maxFileSizeBytes: number;
  rotateCount: number;
};

let auditConfig: AuditLogConfig = {
  filePath: DEFAULT_AUDIT_FILE,
  maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
  rotateCount: DEFAULT_ROTATE_COUNT,
};

/** Cached hash of the last written entry for chain continuity. */
let lastEntryHash: string | undefined;

/**
 * Configure the audit log writer. Call once at startup.
 */
export function configureAuditLog(opts: {
  filePath?: string;
  maxFileSizeMb?: number;
  rotateCount?: number;
}): void {
  auditConfig = {
    filePath: opts.filePath ?? DEFAULT_AUDIT_FILE,
    maxFileSizeBytes: (opts.maxFileSizeMb ?? 50) * 1024 * 1024,
    rotateCount: opts.rotateCount ?? DEFAULT_ROTATE_COUNT,
  };
  lastEntryHash = undefined;
}

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSha256(data: string): string {
  return createHmac("sha256", HMAC_KEY).update(data, "utf8").digest("hex");
}

// ── Legacy file-based helpers ────────────────────────────────────

async function readLastHash(filePath: string): Promise<string> {
  const SMALL_FILE_THRESHOLD = 64 * 1024;
  try {
    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      return "0";
    }

    if (stat.size < SMALL_FILE_THRESHOLD) {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.trimEnd().split("\n");
      const lastLine = lines[lines.length - 1];
      return lastLine ? sha256(lastLine) : "0";
    }

    const fd = await fs.open(filePath, "r");
    try {
      const CHUNK_SIZE = 8192;
      let position = stat.size;
      let tail = Buffer.alloc(0);
      while (position > 0) {
        const readSize = Math.min(CHUNK_SIZE, position);
        position -= readSize;
        const buf = Buffer.alloc(readSize);
        await fd.read(buf, 0, readSize, position);
        tail = Buffer.concat([buf, tail]);
        const trimmed = tail.toString("utf8").trimEnd();
        const nlIndex = trimmed.lastIndexOf("\n");
        if (nlIndex !== -1) {
          const lastLine = trimmed.slice(nlIndex + 1);
          return lastLine ? sha256(lastLine) : "0";
        }
        if (position === 0) {
          return trimmed ? sha256(trimmed) : "0";
        }
      }
    } finally {
      await fd.close();
    }
  } catch {
    // File does not exist or cannot be read
  }
  return "0";
}

async function rotateIfNeeded(filePath: string, maxBytes: number, keep: number): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < maxBytes) {
      return;
    }
  } catch {
    return;
  }
  for (let i = keep; i >= 1; i -= 1) {
    const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
    const dst = `${filePath}.${i}`;
    try {
      await fs.rename(src, dst);
    } catch {
      /* source may not exist */
    }
  }
  lastEntryHash = "0";
}

/**
 * Append an audit entry to the log.
 * Uses SQLite when available, falls back to JSONL file.
 */
export async function writeAuditEntry(
  entry: Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac">,
): Promise<void> {
  try {
    if (dalIsAuditAvailable()) {
      // SQLite path — no file locking needed
      if (lastEntryHash === undefined) {
        const lastJson = dalGetLastAuditEntryJson();
        lastEntryHash = lastJson ? sha256(lastJson) : "0";
      }

      const entryWithoutHmac = {
        timestamp: new Date().toISOString(),
        ...entry,
        prevHash: lastEntryHash,
      };
      const hmac = hmacSha256(JSON.stringify(entryWithoutHmac));

      const fullEntry: AuditLogEntry = { ...entryWithoutHmac, hmac };
      const line = JSON.stringify(fullEntry);

      const row: AuditEntryRow = {
        timestamp: fullEntry.timestamp,
        extensionId: fullEntry.extensionId,
        action: fullEntry.action,
        actor: fullEntry.actor,
        orderSnapshot: fullEntry.orderSnapshot ? JSON.stringify(fullEntry.orderSnapshot) : null,
        policySnapshot: fullEntry.policySnapshot ? JSON.stringify(fullEntry.policySnapshot) : null,
        error: fullEntry.error ?? null,
        prevHash: fullEntry.prevHash,
        hmac: fullEntry.hmac,
      };

      dalAppendAuditEntry(row);
      lastEntryHash = sha256(line);
      return;
    }

    // Legacy JSONL file path
    const dir = path.dirname(auditConfig.filePath);
    await fs.mkdir(dir, { recursive: true });

    await withFileLock(auditConfig.filePath, LOCK_OPTIONS, async () => {
      await rotateIfNeeded(
        auditConfig.filePath,
        auditConfig.maxFileSizeBytes,
        auditConfig.rotateCount,
      );

      if (lastEntryHash === undefined) {
        lastEntryHash = await readLastHash(auditConfig.filePath);
      }

      const entryWithoutHmac = {
        timestamp: new Date().toISOString(),
        ...entry,
        prevHash: lastEntryHash,
      };
      const hmac = hmacSha256(JSON.stringify(entryWithoutHmac));
      const fullEntry: AuditLogEntry = { ...entryWithoutHmac, hmac };
      const line = JSON.stringify(fullEntry);

      await fs.appendFile(auditConfig.filePath, `${line}\n`, { mode: 0o600 });
      lastEntryHash = sha256(line);
    });
  } catch (err) {
    log.error(`audit log write failed: ${String(err)}`);
  }
}

/**
 * Verify the HMAC chain integrity of the audit log.
 */
export async function verifyAuditChain(
  filePath?: string,
): Promise<{ valid: number; brokenAt?: number; hmacFailedAt?: number }> {
  if (dalIsAuditAvailable() && !filePath) {
    // Verify from SQLite
    const entries = dalReadAuditEntries();
    let prevHash = "0";

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.prevHash !== prevHash) {
        return { valid: i, brokenAt: i };
      }
      // Reconstruct entry for HMAC verification
      const reconstructed = {
        timestamp: e.timestamp,
        extensionId: e.extensionId,
        action: e.action,
        actor: e.actor,
        ...(e.orderSnapshot ? { orderSnapshot: JSON.parse(e.orderSnapshot) } : {}),
        ...(e.policySnapshot ? { policySnapshot: JSON.parse(e.policySnapshot) } : {}),
        ...(e.error ? { error: e.error } : {}),
        prevHash: e.prevHash,
      };
      const expectedHmac = hmacSha256(JSON.stringify(reconstructed));
      if (e.hmac && e.hmac !== expectedHmac) {
        return { valid: i, brokenAt: i, hmacFailedAt: i };
      }
      prevHash = sha256(JSON.stringify({ ...reconstructed, hmac: e.hmac }));
    }
    return { valid: entries.length };
  }

  // Legacy file-based verification
  const target = filePath ?? auditConfig.filePath;
  let content: string;
  try {
    content = await fs.readFile(target, "utf8");
  } catch {
    return { valid: 0 };
  }

  const lines = content.trimEnd().split("\n").filter(Boolean);
  let prevHash = "0";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    try {
      const entry = JSON.parse(line) as AuditLogEntry;
      if (entry.prevHash !== prevHash) {
        return { valid: i, brokenAt: i };
      }
      if (entry.hmac) {
        const { hmac: _hmac, ...entryWithoutHmac } = entry;
        const expectedHmac = hmacSha256(JSON.stringify(entryWithoutHmac));
        if (entry.hmac !== expectedHmac) {
          return { valid: i, brokenAt: i, hmacFailedAt: i };
        }
      }
      prevHash = sha256(line);
    } catch {
      return { valid: i, brokenAt: i };
    }
  }

  return { valid: lines.length };
}

/**
 * Read all audit entries from the log.
 */
export async function readAuditEntries(filePath?: string): Promise<AuditLogEntry[]> {
  if (dalIsAuditAvailable() && !filePath) {
    const rows = dalReadAuditEntries();
    return rows.map((r) => ({
      timestamp: r.timestamp,
      extensionId: r.extensionId,
      action: r.action as AuditAction,
      actor: r.actor as AuditActor,
      orderSnapshot: r.orderSnapshot ? JSON.parse(r.orderSnapshot) : undefined,
      policySnapshot: r.policySnapshot ? JSON.parse(r.policySnapshot) : undefined,
      error: r.error ?? undefined,
      prevHash: r.prevHash,
      hmac: r.hmac,
    }));
  }

  // Legacy file-based read
  const target = filePath ?? auditConfig.filePath;
  let content: string;
  try {
    content = await fs.readFile(target, "utf8");
  } catch {
    return [];
  }

  const entries: AuditLogEntry[] = [];
  for (const line of content.trimEnd().split("\n")) {
    if (!line) {
      continue;
    }
    try {
      entries.push(JSON.parse(line) as AuditLogEntry);
    } catch {
      log.warn("skipping malformed audit log line");
    }
  }
  return entries;
}
