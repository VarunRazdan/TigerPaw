/**
 * Credential Vault — encrypted-at-rest credential storage for workflows.
 *
 * Encryption/decryption logic lives here. Storage is delegated to the DAL
 * (SQLite or flat-file fallback). Fields are encrypted before save and
 * decrypted after retrieval.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hostname, homedir } from "node:os";
import {
  dalListCredentials,
  dalGetCredentialRaw,
  dalSaveCredentialRaw,
  dalDeleteCredential,
} from "../dal/credentials.js";
import type { StoredCredential } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

/** Derive an encryption key from a stable machine-local seed. */
function deriveKey(): Buffer {
  const seed = `tigerpaw-vault-${hostname()}-${homedir()}`;
  return scryptSync(seed, "tigerpaw-salt-v1", KEY_LENGTH);
}

/** Encrypt a string value. Returns base64-encoded "iv:authTag:ciphertext". */
function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/** Decrypt a value encoded by encrypt(). */
function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }

  const key = deriveKey();
  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf-8");
  decrypted += decipher.final("utf-8");

  return decrypted;
}

/** Encrypt all field values in a credential. */
function encryptFields(fields: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    encrypted[k] = encrypt(v);
  }
  return encrypted;
}

/** Decrypt all field values in a credential. */
function decryptFields(fields: Record<string, string>): Record<string, string> {
  const decrypted: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    try {
      decrypted[k] = decrypt(v);
    } catch {
      decrypted[k] = ""; // Return empty on decryption failure
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
    fields: decryptFields(raw.fields ?? {}),
  };
}

/** Resolve a credential's fields by ID (for template injection). */
export function resolveCredential(id: string): Record<string, string> | null {
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
export function testVault(): { ok: boolean; error?: string } {
  try {
    const testValue = "tigerpaw-vault-test-" + Date.now();
    const encrypted = encrypt(testValue);
    const decrypted = decrypt(encrypted);
    return { ok: decrypted === testValue };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err as string) };
  }
}
