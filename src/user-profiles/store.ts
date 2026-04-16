import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserProfile = {
  displayName?: string;
  agentNameOverride?: string;
  sourceDisplayName?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROFILES_FILENAME = "user-profiles.json";
const MAX_NAME_LENGTH = 50;
const WRITE_DEBOUNCE_MS = 1000;

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let profiles: Map<string, UserProfile> = new Map();
let initialized = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let resolvedPath: string | null = null;

function getProfilesPath(): string {
  if (!resolvedPath) {
    resolvedPath = path.join(resolveStateDir(), PROFILES_FILENAME);
  }
  return resolvedPath;
}

// ---------------------------------------------------------------------------
// Composite key builder
// ---------------------------------------------------------------------------

/**
 * Build a provider-scoped key: `whatsapp:+12025550100` or `telegram:12345678`.
 * Falls back through senderE164 → senderId → "unknown".
 */
export function buildCompositeKey(
  provider: string | undefined,
  senderId: string | undefined,
  senderE164: string | null | undefined,
): string {
  const prov = (provider ?? "unknown").toLowerCase();
  const id = senderE164?.trim() || senderId?.trim() || "unknown";
  return `${prov}:${id}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex -- intentionally stripping control characters from user input
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f\u200b-\u200f\u2028-\u202f\ufeff]/g;

function validateName(raw: string): string | null {
  const cleaned = raw.replace(CONTROL_CHAR_RE, "").trim();
  if (cleaned.length === 0 || cleaned.length > MAX_NAME_LENGTH) {
    return null;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadFromDisk(): Map<string, UserProfile> {
  const filePath = getProfilesPath();
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, UserProfile>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function scheduleDiskWrite(): void {
  if (writeTimer) {
    return;
  }
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void writeToDisk();
  }, WRITE_DEBOUNCE_MS);
}

async function writeToDisk(): Promise<void> {
  const filePath = getProfilesPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const obj: Record<string, UserProfile> = Object.fromEntries(profiles);
  const json = JSON.stringify(obj, null, 2) + "\n";

  // Atomic write: tmp → rename
  const tmp = path.join(
    dir,
    `${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, json, { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch {
    // Best-effort fallback: direct write
    try {
      fs.writeFileSync(filePath, json, { encoding: "utf-8", mode: 0o600 });
    } catch {
      // Silent — user profiles are non-critical
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function ensureLoaded(): void {
  if (!initialized) {
    profiles = loadFromDisk();
    initialized = true;
  }
}

export function getUserProfile(compositeKey: string): UserProfile | undefined {
  ensureLoaded();
  return profiles.get(compositeKey);
}

export function setUserDisplayName(compositeKey: string, rawName: string): string | null {
  const name = validateName(rawName);
  if (!name) {
    return null;
  }
  ensureLoaded();
  const existing = profiles.get(compositeKey) ?? {};
  profiles.set(compositeKey, {
    ...existing,
    displayName: name,
    updatedAt: new Date().toISOString(),
  });
  scheduleDiskWrite();
  return name;
}

export function setUserAgentName(compositeKey: string, rawName: string): string | null {
  const name = validateName(rawName);
  if (!name) {
    return null;
  }
  ensureLoaded();
  const existing = profiles.get(compositeKey) ?? {};
  profiles.set(compositeKey, {
    ...existing,
    agentNameOverride: name,
    updatedAt: new Date().toISOString(),
  });
  scheduleDiskWrite();
  return name;
}

export function setSourceDisplayName(compositeKey: string, pushName: string): void {
  ensureLoaded();
  const existing = profiles.get(compositeKey);
  if (existing && existing.sourceDisplayName === pushName) {
    return;
  }
  profiles.set(compositeKey, {
    ...existing,
    sourceDisplayName: pushName,
  });
  // Don't debounce — this is a background update, low priority
  scheduleDiskWrite();
}

export function resolveUserDisplayName(compositeKey: string, fallbackPushName?: string): string {
  ensureLoaded();
  const profile = profiles.get(compositeKey);
  return profile?.displayName ?? fallbackPushName ?? compositeKey.split(":")[1] ?? "there";
}

export function resolveAgentNameForUser(compositeKey: string, globalAgentName: string): string {
  ensureLoaded();
  const profile = profiles.get(compositeKey);
  return profile?.agentNameOverride ?? globalAgentName;
}

/** Delete all user profiles (used by onboarding.reset). */
export function clearAllProfiles(): void {
  profiles.clear();
  initialized = true;
  const filePath = getProfilesPath();
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File may not exist
  }
}

/** Force flush any pending writes (useful for tests / shutdown). */
export function flushProfiles(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (initialized && profiles.size > 0) {
    void writeToDisk();
  }
}

/** Reset module state (for tests). */
export function _resetForTest(): void {
  profiles = new Map();
  initialized = false;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  resolvedPath = null;
}
