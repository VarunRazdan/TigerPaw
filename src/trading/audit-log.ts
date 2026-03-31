import { createHash, createHmac, randomBytes } from "node:crypto";
import * as fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { withFileLock } from "../plugin-sdk/file-lock.js";
import { retrieveSecret, storeSecret } from "../secrets/keychain.js";
import type { TradeOrder } from "./policy-engine.js";
import type { TradingPolicyConfig } from "./policy-engine.js";

const log = createSubsystemLogger("trading/audit-log");

const DEFAULT_AUDIT_DIR = path.join(os.homedir(), ".tigerpaw", "trading");
const DEFAULT_AUDIT_FILE = path.join(DEFAULT_AUDIT_DIR, "audit.jsonl");
const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_ROTATE_COUNT = 5;

const KEYCHAIN_SECRET_ID = "tigerpaw-audit-hmac-key";

/**
 * Resolve the HMAC key for audit log integrity.
 *
 * Priority:
 *  1. TIGERPAW_AUDIT_HMAC_KEY env var (operator-supplied)
 *  2. Encrypted keychain via retrieveSecret()
 *  3. Legacy plaintext file at ~/.tigerpaw/trading/.audit-hmac-key
 *     (if found, migrates to keychain and deletes the file)
 *  4. Generate new random key and store in keychain
 */
function resolveHmacKey(): string {
  const envKey = process.env.TIGERPAW_AUDIT_HMAC_KEY;
  if (envKey && envKey.length > 0) {
    return envKey;
  }

  const keychainKey = retrieveSecret(KEYCHAIN_SECRET_ID);
  if (keychainKey && keychainKey.length > 0) {
    return keychainKey;
  }

  const keyPath = path.join(DEFAULT_AUDIT_DIR, ".audit-hmac-key");
  try {
    const existing = fsSync.readFileSync(keyPath, "utf8").trim();
    if (existing.length > 0) {
      try {
        storeSecret(KEYCHAIN_SECRET_ID, existing);
        fsSync.unlinkSync(keyPath);
        log.info("migrated audit HMAC key from plaintext file to keychain");
      } catch (err) {
        log.warn(`failed to migrate audit HMAC key to keychain: ${String(err)}`);
      }
      return existing;
    }
  } catch {
    // Key file does not exist — fall through to generate.
  }

  const key = randomBytes(32).toString("hex");
  try {
    storeSecret(KEYCHAIN_SECRET_ID, key);
  } catch (err) {
    // Fall back to plaintext file if keychain storage fails
    log.warn(`failed to store audit HMAC key in keychain: ${String(err)}`);
    try {
      fsSync.mkdirSync(DEFAULT_AUDIT_DIR, { recursive: true, mode: 0o700 });
      fsSync.writeFileSync(keyPath, key, { mode: 0o600, encoding: "utf8" });
    } catch (writeErr) {
      log.warn(`failed to persist audit HMAC key: ${String(writeErr)}`);
    }
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
  // Reset cached hash so next write re-reads the chain tail.
  lastEntryHash = undefined;
}

/**
 * Compute SHA-256 of a JSONL line for chain linking.
 */
function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Compute HMAC-SHA256 for a serialized entry, providing tamper evidence.
 */
function hmacSha256(data: string): string {
  return createHmac("sha256", HMAC_KEY).update(data, "utf8").digest("hex");
}

/**
 * Read the hash of the last line in the audit file to continue the chain.
 * Returns the genesis hash "0" when the file is empty or missing.
 *
 * For files >= 64 KB, uses a streaming approach that reads from the end of
 * the file to avoid loading the entire audit log into memory.
 */
async function readLastHash(filePath: string): Promise<string> {
  const SMALL_FILE_THRESHOLD = 64 * 1024; // 64 KB

  try {
    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      return "0";
    }

    // Small files: read the whole thing (simple path).
    if (stat.size < SMALL_FILE_THRESHOLD) {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.trimEnd().split("\n");
      const lastLine = lines[lines.length - 1];
      if (lastLine) {
        return sha256(lastLine);
      }
      return "0";
    }

    // Large files: read backward from the end to find the last newline.
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

        // We need to find the last non-empty line. Trim trailing newlines,
        // then look for the preceding newline to isolate the last line.
        const trimmed = tail.toString("utf8").trimEnd();
        const nlIndex = trimmed.lastIndexOf("\n");
        if (nlIndex !== -1) {
          const lastLine = trimmed.slice(nlIndex + 1);
          if (lastLine) {
            return sha256(lastLine);
          }
          return "0";
        }

        // If we've read the entire file without finding a second newline,
        // the whole content is a single line.
        if (position === 0) {
          if (trimmed) {
            return sha256(trimmed);
          }
          return "0";
        }
      }
    } finally {
      await fd.close();
    }
  } catch {
    // File does not exist or cannot be read -- start a new chain.
  }
  return "0";
}

/**
 * Rotate the audit log file when it exceeds the size limit.
 * Renames audit.jsonl -> audit.jsonl.1, .1 -> .2, ..., dropping the oldest.
 */
async function rotateIfNeeded(filePath: string, maxBytes: number, keep: number): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < maxBytes) {
      return;
    }
  } catch {
    // File doesn't exist yet -- nothing to rotate.
    return;
  }

  // Shift existing rotations (oldest first so we don't overwrite).
  for (let i = keep; i >= 1; i -= 1) {
    const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
    const dst = `${filePath}.${i}`;
    try {
      await fs.rename(src, dst);
    } catch {
      // Source may not exist; that's fine.
    }
  }

  // Reset cached hash since the primary file is now empty.
  // Each rotated file forms an independently verifiable chain starting from "0".
  // Cross-file chain continuity is tracked via the rotation metadata (file ordering).
  lastEntryHash = "0";
}

/**
 * Append an audit entry to the JSONL log.
 *
 * This function is intentionally fire-and-forget safe: it never throws.
 * Errors are logged to stderr so they never block trade execution.
 */
export async function writeAuditEntry(
  entry: Omit<AuditLogEntry, "timestamp" | "prevHash" | "hmac">,
): Promise<void> {
  try {
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

      // Build the entry without HMAC first, then compute HMAC over its serialization.
      const entryWithoutHmac = {
        timestamp: new Date().toISOString(),
        ...entry,
        prevHash: lastEntryHash,
      };
      const hmac = hmacSha256(JSON.stringify(entryWithoutHmac));

      const fullEntry: AuditLogEntry = {
        ...entryWithoutHmac,
        hmac,
      };

      const line = JSON.stringify(fullEntry);
      const signedLine = `${line}\n`;

      await fs.appendFile(auditConfig.filePath, signedLine, { mode: 0o600 });

      // Update the chain hash for the next entry.
      lastEntryHash = sha256(line);
    });
  } catch (err) {
    // Never throw from the audit writer -- log to stderr and move on.
    log.error(`audit log write failed: ${String(err)}`);
  }
}

/**
 * Verify the HMAC chain integrity of an audit log file.
 * Returns the number of valid entries and the index of the first broken link (if any).
 */
export async function verifyAuditChain(
  filePath?: string,
): Promise<{ valid: number; brokenAt?: number; hmacFailedAt?: number }> {
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

      // Verify HMAC if present (entries written before the fix won't have it).
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
 * Read all audit entries from the log file.
 * Useful for diagnostics and UI display.
 */
export async function readAuditEntries(filePath?: string): Promise<AuditLogEntry[]> {
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
