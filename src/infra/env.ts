import { createSubsystemLogger } from "../logging/subsystem.js";
import { parseBooleanValue } from "../utils/boolean.js";

const log = createSubsystemLogger("env");
const loggedEnv = new Set<string>();

type AcceptedEnvOption = {
  key: string;
  description: string;
  value?: string;
  redact?: boolean;
};

function formatEnvValue(value: string, redact?: boolean): string {
  if (redact) {
    return "<redacted>";
  }
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 160) {
    return singleLine;
  }
  return `${singleLine.slice(0, 160)}…`;
}

export function logAcceptedEnvOption(option: AcceptedEnvOption): void {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return;
  }
  if (loggedEnv.has(option.key)) {
    return;
  }
  const rawValue = option.value ?? process.env[option.key];
  if (!rawValue || !rawValue.trim()) {
    return;
  }
  loggedEnv.add(option.key);
  log.info(`env: ${option.key}=${formatEnvValue(rawValue, option.redact)} (${option.description})`);
}

export function normalizeZaiEnv(): void {
  if (!process.env.ZAI_API_KEY?.trim() && process.env.Z_AI_API_KEY?.trim()) {
    process.env.ZAI_API_KEY = process.env.Z_AI_API_KEY;
  }
}

export function isTruthyEnvValue(value?: string): boolean {
  return parseBooleanValue(value) === true;
}

/**
 * Migrate OPENCLAW_* env vars to TIGERCLAW_* equivalents.
 * If the TIGERCLAW_* variant is not set but OPENCLAW_* is, copy the value.
 */
function migrateOpenClawEnv(): void {
  const prefix = "OPENCLAW_";
  const newPrefix = "TIGERCLAW_";
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(prefix)) {
      const newKey = newPrefix + key.slice(prefix.length);
      if (!process.env[newKey]?.trim()) {
        process.env[newKey] = process.env[key];
      }
    }
  }
}

/**
 * Migrate TIGERCLAW_* env vars to TIGERPAW_* equivalents.
 * If the TIGERPAW_* variant is not set but TIGERCLAW_* is, copy the value.
 */
function migrateTigerClawEnv(): void {
  const prefix = "TIGERCLAW_";
  const newPrefix = "TIGERPAW_";
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(prefix)) {
      const newKey = newPrefix + key.slice(prefix.length);
      if (!process.env[newKey]?.trim()) {
        process.env[newKey] = process.env[key];
      }
    }
  }
}

export function normalizeEnv(): void {
  migrateOpenClawEnv();
  migrateTigerClawEnv();
  normalizeZaiEnv();
}
