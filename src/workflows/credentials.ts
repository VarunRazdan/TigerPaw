/**
 * Credential Vault — encrypted-at-rest credential storage for workflows.
 *
 * Encryption uses AES-256-GCM with a 12-byte IV (per spec) and a per-install
 * random master key from `vault-master-key.ts`. New ciphertexts are tagged
 * with a `v2:` envelope prefix; values without the prefix are decrypted with
 * the legacy host-derived key (16-byte IV) so existing installs keep working.
 * Each `saveCredential` re-encrypts under v2, so vaults migrate lazily.
 *
 * Storage is delegated to the DAL (SQLite or flat-file fallback).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hostname, homedir } from "node:os";
import {
  dalListCredentials,
  dalGetCredentialRaw,
  dalSaveCredentialRaw,
  dalDeleteCredential,
} from "../dal/credentials.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { StoredCredential } from "./types.js";
import { loadOrGenerateMasterKey } from "./vault-master-key.js";

const log = createSubsystemLogger("workflows/credentials");

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const V2_PREFIX = "v2:";
const LEGACY_IV_LENGTH = 16;

/**
 * Legacy key derivation — kept indefinitely so existing installs can decrypt
 * credentials written before the master-key migration. New ciphertexts use
 * `loadOrGenerateMasterKey()` instead.
 *
 * @deprecated retained only for legacy decrypt; do not use for new ciphertexts.
 */
function deriveKeyLegacy(): Buffer {
  const seed = `tigerpaw-vault-${hostname()}-${homedir()}`;
  return scryptSync(seed, "tigerpaw-salt-v1", KEY_LENGTH);
}

/** Encrypt a string value. Returns "v2:<iv12>:<authTag>:<ciphertext>" (all base64). */
function encrypt(plaintext: string): string {
  const key = loadOrGenerateMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${V2_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/** Decrypt a value encoded by encrypt() or the pre-v2 format. */
function decrypt(encoded: string): string {
  if (encoded.startsWith(V2_PREFIX)) {
    return decryptWith(encoded.slice(V2_PREFIX.length), loadOrGenerateMasterKey(), IV_LENGTH);
  }
  // Legacy envelope: pre-v2 ciphertexts have no prefix and used a 16-byte IV.
  return decryptWith(encoded, deriveKeyLegacy(), LEGACY_IV_LENGTH);
}

function decryptWith(payload: string, key: Buffer, expectedIvLength: number): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }

  const iv = Buffer.from(parts[0], "base64");
  if (iv.length !== expectedIvLength) {
    throw new Error(`Invalid IV length: got ${iv.length}, expected ${expectedIvLength}`);
  }
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf-8");
  decrypted += decipher.final("utf-8");

  return decrypted;
}

/** Encrypt all field values in a credential. Null/undefined values pass through. */
function encryptFields(
  fields: Record<string, string | null | undefined>,
): Record<string, string | null> {
  const encrypted: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) {
      // Preserve null instead of round-tripping the literal string "null".
      encrypted[k] = null;
      continue;
    }
    encrypted[k] = encrypt(v);
  }
  return encrypted;
}

/**
 * Decrypt all field values in a credential.
 *
 * Returns `null` for any field whose ciphertext fails to decrypt (logged at
 * `warn`). Callers can distinguish "field never set" from "decrypt failed";
 * historically this returned `""` and silently masked corruption.
 */
function decryptFields(
  fields: Record<string, string | null>,
  credentialId: string,
): Record<string, string | null> {
  const decrypted: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) {
      decrypted[k] = null;
      continue;
    }
    try {
      decrypted[k] = decrypt(v);
    } catch (err) {
      log.warn(
        `Failed to decrypt credential field; returning null. id=${credentialId} field=${k} err=${
          err instanceof Error ? err.message : String(err as string)
        }`,
      );
      decrypted[k] = null;
    }
  }
  return decrypted;
}

// ── Public API ────────────────────────────────────────────────────

/** List all stored credentials (fields are redacted in listing). */
export function listCredentials(): Array<
  Omit<StoredCredential, "fields"> & { fieldKeys: string[] }
> {
  return dalListCredentials();
}

/** Get a credential by ID (decrypted). */
export function getCredential(id: string): StoredCredential | null {
  const raw = dalGetCredentialRaw(id);
  if (!raw) {
    return null;
  }
  return {
    ...raw,
    fields: decryptFields(raw.fields ?? {}, id),
  };
}

/** Resolve a credential's fields by ID (for template injection). */
export function resolveCredential(id: string): Record<string, string | null> | null {
  const cred = getCredential(id);
  return cred?.fields ?? null;
}

/** Save a credential (encrypts fields before writing). */
export function saveCredential(credential: StoredCredential): void {
  const encrypted = {
    ...credential,
    fields: encryptFields(credential.fields),
  };
  dalSaveCredentialRaw(encrypted);
}

/** Delete a credential by ID. */
export function deleteCredential(id: string): boolean {
  return dalDeleteCredential(id);
}

/** Test that encryption/decryption works (health check). */
export function testVault(): { ok: boolean; keyFormat?: "v2"; error?: string } {
  try {
    const testValue = "tigerpaw-vault-test-" + Date.now();
    const encrypted = encrypt(testValue);
    const decrypted = decrypt(encrypted);
    return {
      ok: decrypted === testValue,
      keyFormat: encrypted.startsWith(V2_PREFIX) ? "v2" : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err as string) };
  }
}
