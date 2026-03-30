/**
 * Credentials DAL — SQLite-backed encrypted credential storage.
 *
 * Encryption/decryption stays in the caller (`workflows/credentials.ts`).
 * This module stores pre-encrypted field values and retrieves them as-is.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// ── Legacy imports (fallback) ───────────────────────────────────
import type { DatabaseSync } from "node:sqlite";
import type { StoredCredential } from "../workflows/types.js";
import { getDatabase, isDatabaseAvailable } from "./database.js";

const LEGACY_DIR = join(homedir(), ".tigerpaw", "credentials");

// ── SQLite implementations ──────────────────────────────────────

/** List all credentials (encrypted fields stored as JSON). */
function dbListCredentials(
  db: DatabaseSync,
): Array<Omit<StoredCredential, "fields"> & { fieldKeys: string[] }> {
  const rows = db.prepare("SELECT * FROM credentials ORDER BY updated_at DESC").all() as Array<
    Record<string, unknown>
  >;
  return rows.map((row) => {
    const fields = JSON.parse((row.fields as string) || "{}") as Record<string, string>;
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      fieldKeys: Object.keys(fields),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  });
}

/** Get a credential by ID (returns raw/encrypted fields). */
function dbGetCredentialRaw(db: DatabaseSync, id: string): StoredCredential | null {
  const row = db.prepare("SELECT * FROM credentials WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    return null;
  }
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    fields: JSON.parse((row.fields as string) || "{}"),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Save a credential (fields should already be encrypted by caller). */
function dbSaveCredentialRaw(db: DatabaseSync, credential: StoredCredential): void {
  db.prepare(`
    INSERT OR REPLACE INTO credentials (id, name, type, fields, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    credential.id,
    credential.name,
    credential.type,
    JSON.stringify(credential.fields),
    credential.createdAt,
    credential.updatedAt,
  );
}

/** Delete a credential by ID. */
function dbDeleteCredential(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("DELETE FROM credentials WHERE id = ?").run(id);
  return result.changes > 0;
}

/** Find all credentials of a given type (for integration token lookups). */
function dbFindByType(db: DatabaseSync, type: string): StoredCredential[] {
  const rows = db.prepare("SELECT * FROM credentials WHERE type = ?").all(type) as Array<
    Record<string, unknown>
  >;
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    fields: JSON.parse((row.fields as string) || "{}"),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

// ── Legacy flat-file implementations ────────────────────────────

function legacyEnsureDir(): void {
  if (!existsSync(LEGACY_DIR)) {
    mkdirSync(LEGACY_DIR, { recursive: true });
  }
}

function legacyListCredentials(): Array<
  Omit<StoredCredential, "fields"> & { fieldKeys: string[] }
> {
  legacyEnsureDir();
  return readdirSync(LEGACY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const raw = JSON.parse(readFileSync(join(LEGACY_DIR, f), "utf-8"));
        return {
          id: raw.id as string,
          name: raw.name as string,
          type: raw.type as string,
          fieldKeys: Object.keys(raw.fields ?? {}),
          createdAt: raw.createdAt as string,
          updatedAt: raw.updatedAt as string,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<Omit<StoredCredential, "fields"> & { fieldKeys: string[] }>;
}

function legacyGetCredentialRaw(id: string): StoredCredential | null {
  const filePath = join(LEGACY_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function legacySaveCredentialRaw(credential: StoredCredential): void {
  legacyEnsureDir();
  writeFileSync(
    join(LEGACY_DIR, `${credential.id}.json`),
    JSON.stringify(credential, null, 2),
    "utf-8",
  );
}

function legacyDeleteCredential(id: string): boolean {
  const filePath = join(LEGACY_DIR, `${id}.json`);
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}

function legacyFindByType(type: string): StoredCredential[] {
  legacyEnsureDir();
  const result: StoredCredential[] = [];
  for (const f of readdirSync(LEGACY_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const raw = JSON.parse(readFileSync(join(LEGACY_DIR, f), "utf-8")) as StoredCredential;
      if (raw.type === type) {
        result.push(raw);
      }
    } catch {
      /* skip */
    }
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────────

export function dalListCredentials(): Array<
  Omit<StoredCredential, "fields"> & { fieldKeys: string[] }
> {
  if (isDatabaseAvailable()) {
    return dbListCredentials(getDatabase());
  }
  return legacyListCredentials();
}

export function dalGetCredentialRaw(id: string): StoredCredential | null {
  if (isDatabaseAvailable()) {
    return dbGetCredentialRaw(getDatabase(), id);
  }
  return legacyGetCredentialRaw(id);
}

export function dalSaveCredentialRaw(credential: StoredCredential): void {
  if (isDatabaseAvailable()) {
    dbSaveCredentialRaw(getDatabase(), credential);
  } else {
    legacySaveCredentialRaw(credential);
  }
}

export function dalDeleteCredential(id: string): boolean {
  if (isDatabaseAvailable()) {
    return dbDeleteCredential(getDatabase(), id);
  }
  return legacyDeleteCredential(id);
}

export function dalFindByType(type: string): StoredCredential[] {
  if (isDatabaseAvailable()) {
    return dbFindByType(getDatabase(), type);
  }
  return legacyFindByType(type);
}
