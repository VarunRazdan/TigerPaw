import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("secrets/credential-rotation");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CredentialMetadataEntry = {
  /** ISO-8601 timestamp when the credential was stored. */
  storedAt: string;
  /** Extension that owns this credential. */
  extensionId: string;
  /** The secret identifier within the extension. */
  secretId: string;
};

type CredentialMetadataStore = {
  credentials: Record<string, CredentialMetadataEntry>;
};

export type CredentialAgeReport = {
  extensionId: string;
  secretId: string;
  ageDays: number;
  isExpired: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_AGE_DAYS = 90;
const METADATA_DIR = path.join(os.homedir(), ".tigerpaw", "credentials");
const METADATA_FILE = path.join(METADATA_DIR, "metadata.json");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a composite key for the metadata store.
 */
function metadataKey(extensionId: string, secretId: string): string {
  return `${extensionId}:${secretId}`;
}

/**
 * Load the metadata store from disk. Returns an empty store if the file
 * does not exist or cannot be parsed.
 */
async function loadMetadata(): Promise<CredentialMetadataStore> {
  try {
    const raw = await fs.readFile(METADATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as CredentialMetadataStore;
    if (parsed && typeof parsed === "object" && parsed.credentials) {
      return parsed;
    }
  } catch {
    // File missing or malformed -- start fresh.
  }
  return { credentials: {} };
}

/**
 * Persist the metadata store to disk. Creates the parent directory if needed.
 */
async function saveMetadata(store: CredentialMetadataStore): Promise<void> {
  await fs.mkdir(METADATA_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(METADATA_FILE, JSON.stringify(store, null, 2), {
    mode: 0o600,
    encoding: "utf8",
  });
}

/**
 * Compute the number of full days between a past timestamp and now.
 */
function daysSince(isoTimestamp: string): number {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  if (!Number.isFinite(then)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record that a credential was stored (or refreshed). Call this whenever a
 * secret is written to the keychain or any other backing store. The timestamp
 * is set to the current wall-clock time.
 */
export async function recordCredentialStore(extensionId: string, secretId: string): Promise<void> {
  try {
    const store = await loadMetadata();
    const key = metadataKey(extensionId, secretId);
    store.credentials[key] = {
      storedAt: new Date().toISOString(),
      extensionId,
      secretId,
    };
    await saveMetadata(store);
    log.debug(`recorded credential store: ${key}`);
  } catch (err) {
    log.error(`failed to record credential store: ${String(err)}`);
  }
}

/**
 * Check the age of all tracked credentials and return a report for each.
 *
 * @param maxAgeDays - Credentials older than this many days are reported as
 *   expired. Defaults to 90.
 * @returns An array of age reports, one per tracked credential.
 */
export async function checkCredentialAge(maxAgeDays?: number): Promise<CredentialAgeReport[]> {
  const threshold = maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  try {
    const store = await loadMetadata();
    const results: CredentialAgeReport[] = [];

    for (const entry of Object.values(store.credentials)) {
      const ageDays = daysSince(entry.storedAt);
      results.push({
        extensionId: entry.extensionId,
        secretId: entry.secretId,
        ageDays,
        isExpired: ageDays >= threshold,
      });
    }

    const expired = results.filter((r) => r.isExpired);
    if (expired.length > 0) {
      log.warn(`${expired.length} credential(s) older than ${threshold} days`);
    }

    return results;
  } catch (err) {
    log.error(`failed to check credential age: ${String(err)}`);
    return [];
  }
}
