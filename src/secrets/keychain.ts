import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { logSecretAccess } from "./access-log.js";

const log = createSubsystemLogger("secrets/keychain");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeychainSecretRef = {
  source: "keychain";
  id: string;
};

type KeychainBackend = "macos" | "linux-secret-tool" | "encrypted-file";

type EncryptedPayload = {
  iv: string;
  tag: string;
  data: string;
  salt: string;
};

type EncryptedStore = Record<string, EncryptedPayload>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT = "tigerpaw";
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LEN = 32;
const PBKDF2_DIGEST = "sha512";
const GCM_IV_LEN = 12;
const CREDENTIALS_DIR = path.join(os.homedir(), ".tigerpaw");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.enc");

// ---------------------------------------------------------------------------
// Backend detection
// ---------------------------------------------------------------------------

function detectBackend(): KeychainBackend {
  if (process.platform === "darwin") {
    return "macos";
  }
  if (process.platform === "linux") {
    try {
      execFileSync("which", ["secret-tool"], { stdio: "pipe" });
      return "linux-secret-tool";
    } catch {
      /* secret-tool not available */
    }
  }
  return "encrypted-file";
}

let cachedBackend: KeychainBackend | undefined;

function getBackend(): KeychainBackend {
  if (cachedBackend === undefined) {
    cachedBackend = detectBackend();
    log.debug(`keychain backend: ${cachedBackend}`);
  }
  return cachedBackend;
}

// ---------------------------------------------------------------------------
// macOS Keychain via /usr/bin/security
// ---------------------------------------------------------------------------

function macosStore(id: string, value: string): void {
  execFileSync(
    "/usr/bin/security",
    ["add-generic-password", "-U", "-a", ACCOUNT, "-s", id, "-w", value, "-T", ""],
    { stdio: "pipe" },
  );
}

function macosRetrieve(id: string): string | undefined {
  try {
    const out = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-a", ACCOUNT, "-s", id, "-w"],
      { stdio: "pipe", encoding: "utf8" },
    );
    return out.trimEnd();
  } catch {
    return undefined;
  }
}

function macosDelete(id: string): void {
  try {
    execFileSync("/usr/bin/security", ["delete-generic-password", "-a", ACCOUNT, "-s", id], {
      stdio: "pipe",
    });
  } catch {
    /* entry may not exist */
  }
}

// ---------------------------------------------------------------------------
// Linux secret-tool (libsecret-tools)
// ---------------------------------------------------------------------------

function linuxStore(id: string, value: string): void {
  execFileSync(
    "secret-tool",
    ["store", "--label", `Tigerpaw: ${id}`, "application", ACCOUNT, "key", id],
    { input: value, stdio: ["pipe", "pipe", "pipe"] },
  );
}

function linuxRetrieve(id: string): string | undefined {
  try {
    const out = execFileSync("secret-tool", ["lookup", "application", ACCOUNT, "key", id], {
      stdio: "pipe",
      encoding: "utf8",
    });
    return out || undefined;
  } catch {
    return undefined;
  }
}

function linuxDelete(id: string): void {
  try {
    execFileSync("secret-tool", ["clear", "application", ACCOUNT, "key", id], { stdio: "pipe" });
  } catch {
    /* entry may not exist */
  }
}

// ---------------------------------------------------------------------------
// Encrypted file fallback (AES-256-GCM + PBKDF2)
// ---------------------------------------------------------------------------

function getPassphrase(): string {
  const env = process.env.TIGERPAW_PASSPHRASE;
  if (env && env.trim().length > 0) {
    return env.trim();
  }

  // Try to read or generate a random fallback key persisted to disk.
  const fallbackKeyDir = path.join(os.homedir(), ".tigerpaw", "credentials");
  const fallbackKeyPath = path.join(fallbackKeyDir, ".fallback-key");
  try {
    const existing = fs.readFileSync(fallbackKeyPath, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch {
    // File doesn't exist yet -- generate one.
  }

  try {
    const key = randomBytes(32).toString("hex");
    fs.mkdirSync(fallbackKeyDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(fallbackKeyPath, key, { mode: 0o600, encoding: "utf8" });
    return key;
  } catch {
    // Read-only filesystem or other write failure -- refuse to use a predictable key.
    throw new Error(
      "Cannot derive encryption key: no writable filesystem for key storage and TIGERPAW_PASSPHRASE env var not set. " +
        "Set TIGERPAW_PASSPHRASE or ensure ~/.tigerpaw/ is writable.",
    );
  }
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST);
}

function loadEncryptedStore(): EncryptedStore {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8")) as EncryptedStore;
  } catch {
    return {};
  }
}

function saveEncryptedStore(store: EncryptedStore): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), {
    mode: 0o600,
    encoding: "utf8",
  });
}

function fileStore(id: string, value: string): void {
  const store = loadEncryptedStore();
  const salt = randomBytes(32);
  const key = deriveKey(getPassphrase(), salt);
  const iv = randomBytes(GCM_IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  store[id] = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
    salt: salt.toString("base64"),
  };
  saveEncryptedStore(store);
}

function fileRetrieve(id: string): string | undefined {
  const entry = loadEncryptedStore()[id];
  if (!entry) {
    return undefined;
  }
  try {
    const salt = Buffer.from(entry.salt, "base64");
    const key = deriveKey(getPassphrase(), salt);
    const iv = Buffer.from(entry.iv, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(entry.data, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    log.warn(`failed to decrypt secret "${id}" from fallback store`);
    return undefined;
  }
}

function fileDelete(id: string): void {
  const store = loadEncryptedStore();
  if (id in store) {
    delete store[id];
    saveEncryptedStore(store);
  }
}

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

type BackendOps = {
  store: (id: string, value: string) => void;
  retrieve: (id: string) => string | undefined;
  delete: (id: string) => void;
};

const BACKENDS: Record<KeychainBackend, BackendOps> = {
  macos: { store: macosStore, retrieve: macosRetrieve, delete: macosDelete },
  "linux-secret-tool": { store: linuxStore, retrieve: linuxRetrieve, delete: linuxDelete },
  "encrypted-file": { store: fileStore, retrieve: fileRetrieve, delete: fileDelete },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check whether a native OS keychain backend is available. */
export function isKeychainAvailable(): boolean {
  const b = getBackend();
  return b === "macos" || b === "linux-secret-tool";
}

/** Store a secret in the OS keychain (or encrypted file fallback). */
export function storeSecret(id: string, value: string, accessor = "keychain"): void {
  const backend = getBackend();
  log.debug(`storing secret "${id}" via ${backend}`);
  try {
    BACKENDS[backend].store(id, value);
    logSecretAccess({ secretId: id, accessor, operation: "write" });
  } catch (err) {
    log.error(`failed to store secret "${id}": ${String(err)}`);
    throw err;
  }
}

/**
 * Retrieve a secret from the OS keychain (or encrypted file fallback).
 * Never throws -- returns undefined if the secret is not found.
 */
export function retrieveSecret(id: string, accessor = "keychain"): string | undefined {
  const backend = getBackend();
  log.debug(`retrieving secret "${id}" via ${backend}`);
  try {
    const value = BACKENDS[backend].retrieve(id);
    logSecretAccess({ secretId: id, accessor, operation: "read" });
    return value;
  } catch (err) {
    log.warn(`failed to retrieve secret "${id}": ${String(err)}`);
    return undefined;
  }
}

/** Delete a secret from the OS keychain (or encrypted file fallback). */
export function deleteSecret(id: string, accessor = "keychain"): void {
  const backend = getBackend();
  log.debug(`deleting secret "${id}" via ${backend}`);
  try {
    BACKENDS[backend].delete(id);
    logSecretAccess({ secretId: id, accessor, operation: "delete" });
  } catch (err) {
    log.error(`failed to delete secret "${id}": ${String(err)}`);
    throw err;
  }
}

/** Resolve a KeychainSecretRef to a value. Returns undefined if not found. */
export function resolveKeychainSecret(ref: KeychainSecretRef): string | undefined {
  return retrieveSecret(ref.id);
}

/** Reset the cached backend (useful for testing). */
export function resetKeychainBackendCache(): void {
  cachedBackend = undefined;
}

/** List all secret IDs in the encrypted file store. Returns empty for native keychains. */
export function listSecrets(): string[] {
  const backend = getBackend();
  if (backend !== "encrypted-file") {
    return [];
  }
  const store = loadEncryptedStore();
  return Object.keys(store);
}

/** Export secret IDs and their metadata (NOT values) for backup/migration. */
export function exportSecretIds(): Array<{ id: string; backend: string }> {
  const backend = getBackend();
  if (backend !== "encrypted-file") {
    return [];
  }
  return Object.keys(loadEncryptedStore()).map((id) => ({ id, backend }));
}
