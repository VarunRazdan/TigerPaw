import type { OpenClawConfig } from "../config/config.js";
import { compileSafeRegex } from "../security/safe-regex.js";
import { resolveNodeRequireFromMeta } from "./node-require.js";
import { replacePatternBounded } from "./redact-bounded.js";
import { createSubsystemLogger } from "./subsystem.js";

const requireConfig = resolveNodeRequireFromMeta(import.meta.url);
const log = createSubsystemLogger("logging/redact");

export type RedactSensitiveMode = "off" | "tools";

const DEFAULT_REDACT_MODE: RedactSensitiveMode = "tools";
const DEFAULT_REDACT_MIN_LENGTH = 18;
const DEFAULT_REDACT_KEEP_START = 6;
const DEFAULT_REDACT_KEEP_END = 4;
const REDACTED_PLACEHOLDER = "[REDACTED]";

const DEFAULT_REDACT_PATTERNS: string[] = [
  // ENV-style assignments.
  String.raw`\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1`,
  // JSON fields.
  String.raw`"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken)"\s*:\s*"([^"]+)"`,
  // CLI flags.
  String.raw`--(?:api[-_]?key|token|secret|password|passwd)\s+(["']?)([^\s"']+)\1`,
  // Authorization headers.
  String.raw`Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-+=]+)`,
  String.raw`\bBearer\s+([A-Za-z0-9._\-+=]{18,})\b`,
  // PEM blocks.
  String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`,
  // Common token prefixes -- Anthropic keys (sk-ant-...) before generic sk-.
  String.raw`\b(sk-ant-[A-Za-z0-9_-]{8,})\b`,
  String.raw`\b(sk-[A-Za-z0-9_-]{8,})\b`,
  String.raw`\b(ghp_[A-Za-z0-9]{20,})\b`,
  String.raw`\b(github_pat_[A-Za-z0-9_]{20,})\b`,
  String.raw`\b(xox[baprs]-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(xapp-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(gsk_[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(AIza[0-9A-Za-z\-_]{20,})\b`,
  String.raw`\b(pplx-[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(npm_[A-Za-z0-9]{10,})\b`,
  // AWS access keys (AKIA...).
  String.raw`\b(AKIA[0-9A-Z]{16})\b`,
  // Long base64 strings (>40 chars) that likely contain credentials.
  String.raw`\b([A-Za-z0-9+/]{40,}={0,3})\b`,
  // Telegram Bot API URLs embed the token as `/bot<token>/...` (no word-boundary before digits).
  String.raw`\bbot(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
  String.raw`\b(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
];

type RedactOptions = {
  mode?: RedactSensitiveMode;
  patterns?: string[];
};

function normalizeMode(value?: string): RedactSensitiveMode {
  return value === "off" ? "off" : DEFAULT_REDACT_MODE;
}

function parsePattern(raw: string): RegExp | null {
  if (!raw.trim()) {
    return null;
  }
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  if (match) {
    const flags = match[2].includes("g") ? match[2] : `${match[2]}g`;
    return compileSafeRegex(match[1], flags);
  }
  return compileSafeRegex(raw, "gi");
}

function resolvePatterns(value?: string[]): RegExp[] {
  const source = value?.length ? value : DEFAULT_REDACT_PATTERNS;
  return source.map(parsePattern).filter((re): re is RegExp => Boolean(re));
}

function maskToken(token: string): string {
  if (token.length < DEFAULT_REDACT_MIN_LENGTH) {
    return "***";
  }
  const start = token.slice(0, DEFAULT_REDACT_KEEP_START);
  const end = token.slice(-DEFAULT_REDACT_KEEP_END);
  return `${start}…${end}`;
}

function redactPemBlock(block: string): string {
  const lines = block.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return "***";
  }
  return `${lines[0]}\n…redacted…\n${lines[lines.length - 1]}`;
}

function redactMatch(match: string, groups: string[]): string {
  if (match.includes("PRIVATE KEY-----")) {
    return redactPemBlock(match);
  }
  const token =
    groups.filter((value) => typeof value === "string" && value.length > 0).at(-1) ?? match;
  const masked = maskToken(token);
  if (token === match) {
    return masked;
  }
  return match.replace(token, masked);
}

function redactText(text: string, patterns: RegExp[]): string {
  let next = text;
  for (const pattern of patterns) {
    next = replacePatternBounded(next, pattern, (...args: string[]) =>
      redactMatch(args[0], args.slice(1, args.length - 2)),
    );
  }
  return next;
}

function resolveConfigRedaction(): RedactOptions {
  let cfg: OpenClawConfig["logging"] | undefined;
  try {
    const loaded = requireConfig?.("../config/config.js") as
      | {
          loadConfig?: () => OpenClawConfig;
        }
      | undefined;
    cfg = loaded?.loadConfig?.().logging;
  } catch {
    cfg = undefined;
  }
  return {
    mode: normalizeMode(cfg?.redactSensitive),
    patterns: cfg?.redactPatterns,
  };
}

export function redactSensitiveText(text: string, options?: RedactOptions): string {
  if (!text) {
    return text;
  }
  const resolved = options ?? resolveConfigRedaction();
  if (normalizeMode(resolved.mode) === "off") {
    return text;
  }
  const patterns = resolvePatterns(resolved.patterns);
  if (!patterns.length) {
    return text;
  }
  return redactText(text, patterns);
}

export function redactToolDetail(detail: string): string {
  const resolved = resolveConfigRedaction();
  if (normalizeMode(resolved.mode) !== "tools") {
    return detail;
  }
  return redactSensitiveText(detail, resolved);
}

export function getDefaultRedactPatterns(): string[] {
  return [...DEFAULT_REDACT_PATTERNS];
}

// ---------------------------------------------------------------------------
// Tigerpaw secret redaction helpers
// ---------------------------------------------------------------------------

/**
 * Compiled patterns used by redactSecrets -- built once and cached.
 * These target credential-shaped strings with a hard [REDACTED] replacement
 * (no partial masking) for defense-in-depth log scrubbing.
 */
const TIGERPAW_REDACT_PATTERNS: RegExp[] = (() => {
  const sources = [
    // OpenAI keys.
    String.raw`\bsk-[A-Za-z0-9_-]{8,}\b`,
    // Anthropic keys.
    String.raw`\bsk-ant-[A-Za-z0-9_-]{8,}\b`,
    // AWS access key IDs.
    String.raw`\bAKIA[0-9A-Z]{16}\b`,
    // Long base64 strings (>40 chars).
    String.raw`[A-Za-z0-9+/]{40,}={0,3}`,
    // PEM private keys.
    String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`,
    // Bearer tokens.
    String.raw`\bBearer\s+[A-Za-z0-9._\-+=]{18,}\b`,
  ];
  return sources
    .map((s) => {
      try {
        return new RegExp(s, "g");
      } catch {
        return null;
      }
    })
    .filter((re): re is RegExp => re !== null);
})();

/**
 * Replace credential-shaped strings in `text` with `[REDACTED]`.
 * Best-effort: never blocks and never throws.
 */
export function redactSecrets(text: string): string {
  if (!text) {
    return text;
  }
  try {
    let result = text;
    for (const pattern of TIGERPAW_REDACT_PATTERNS) {
      // Reset lastIndex for sticky global patterns.
      pattern.lastIndex = 0;
      result = result.replace(pattern, REDACTED_PLACEHOLDER);
    }
    return result;
  } catch (err) {
    log.debug(`redactSecrets: best-effort failure: ${String(err)}`);
    return text;
  }
}

/**
 * Wrap a log function so that every string argument is scrubbed through
 * `redactSecrets` before forwarding. Non-string arguments are passed through
 * unchanged. Never throws.
 */
export function createRedactingWrapper(
  logFn: (...args: unknown[]) => void,
): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    try {
      const sanitized = args.map((arg) => (typeof arg === "string" ? redactSecrets(arg) : arg));
      logFn(...sanitized);
    } catch {
      // Best-effort: fall through to the original logger.
      try {
        logFn(...args);
      } catch {
        // Swallow -- redaction must never block.
      }
    }
  };
}
