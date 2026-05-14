/**
 * Vault master key — load or generate the 32-byte AES-256-GCM key used by
 * `credentials.ts` to encrypt stored credentials at rest.
 *
 * Storage:
 * - `${stateDir}/vault-master.key` (32 raw random bytes, mode 0o600).
 * - Created atomically on first read via O_EXCL (`fs.openSync(p, "wx", 0o600)`)
 *   so two gateway processes starting simultaneously cannot stomp on each
 *   other — one wins, the other reads what was written.
 *
 * Override:
 * - `TIGERPAW_VAULT_KEY_BASE64` env var supplies a base64-encoded 32-byte key
 *   (for KMS/HSM setups). Validated at module load; throws at boot rather
 *   than deferring to first encrypt.
 */

import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export const VAULT_MASTER_KEY_FILENAME = "vault-master.key";
export const VAULT_KEY_LENGTH = 32;
const ENV_VAR_NAME = "TIGERPAW_VAULT_KEY_BASE64";

let cached: Buffer | null = null;

export function resolveVaultMasterKeyPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), VAULT_MASTER_KEY_FILENAME);
}

function decodeEnvOverride(env: NodeJS.ProcessEnv): Buffer | null {
  const raw = env[ENV_VAR_NAME];
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // Reject obviously invalid base64 by checking the round-trip.
  let decoded: Buffer;
  try {
    decoded = Buffer.from(trimmed, "base64");
  } catch {
    throw new Error(`${ENV_VAR_NAME} is not valid base64`);
  }
  if (Buffer.from(decoded.toString("base64"), "base64").length !== decoded.length) {
    // base64 decoder silently ignores junk; this catches gross malformation.
    throw new Error(`${ENV_VAR_NAME} is not valid base64`);
  }
  if (decoded.length !== VAULT_KEY_LENGTH) {
    throw new Error(
      `${ENV_VAR_NAME} must decode to ${VAULT_KEY_LENGTH} bytes, got ${decoded.length}`,
    );
  }
  return decoded;
}

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

function tryAtomicCreate(filePath: string, key: Buffer): boolean {
  let fd: number;
  try {
    fd = openSync(filePath, "wx", 0o600);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw err;
  }
  try {
    writeSync(fd, key);
  } finally {
    closeSync(fd);
  }
  // Defensive chmod (some filesystems ignore the open mode).
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // best-effort
  }
  return true;
}

function readKeyFile(filePath: string): Buffer {
  const buf = readFileSync(filePath);
  if (buf.length !== VAULT_KEY_LENGTH) {
    throw new Error(
      `Vault master key at ${filePath} has wrong length (${buf.length} bytes, expected ${VAULT_KEY_LENGTH}).`,
    );
  }
  return buf;
}

/**
 * Load or generate the vault master key.
 *
 * Order:
 *   1. `TIGERPAW_VAULT_KEY_BASE64` env var (validated; never written to disk).
 *   2. `${stateDir}/vault-master.key` (read if present).
 *   3. Generate fresh, write atomically (O_EXCL); on race, fall back to read.
 *
 * The result is cached for the lifetime of the process. Tests can call
 * `resetVaultMasterKeyCacheForTests()` to clear it between cases.
 */
export function loadOrGenerateMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  if (cached) {
    return cached;
  }

  const fromEnv = decodeEnvOverride(env);
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  const filePath = resolveVaultMasterKeyPath(env);
  ensureDir(filePath);

  const fresh = randomBytes(VAULT_KEY_LENGTH);
  const created = tryAtomicCreate(filePath, fresh);
  cached = created ? fresh : readKeyFile(filePath);
  return cached;
}

/** Test-only: clear the cached key so the next load re-reads from disk/env. */
export function resetVaultMasterKeyCacheForTests(): void {
  cached = null;
}
