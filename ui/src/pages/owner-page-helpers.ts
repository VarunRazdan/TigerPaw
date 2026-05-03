// Pure helpers for OwnerPage. Kept in their own module so the logic is
// covered by unit tests under the existing TS-only UI test setup
// (the UI doesn't ship @testing-library/react, so component-level
// rendering tests aren't a precedent here).

const E164 = /^\+[1-9][0-9]{6,14}$/;

export function looksLikeE164(value: string): boolean {
  return E164.test(value.trim());
}

/**
 * `commands.ownerAllowFrom` accepts channel-prefixed values like
 * `whatsapp:+85290263757` or `telegram:@user` (command-auth.ts strips the
 * prefix during matching). Treat any prefix-then-colon as valid.
 */
export function looksChannelPrefixed(value: string): boolean {
  const trimmed = value.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0 || colon === trimmed.length - 1) {
    return false;
  }
  const channel = trimmed.slice(0, colon);
  return /^[a-z][a-z0-9-]*$/i.test(channel);
}

export function isPlausibleOwnerEntry(value: string): boolean {
  return looksLikeE164(value) || looksChannelPrefixed(value);
}

/**
 * Strip whitespace, drop empty rows, dedupe while preserving order.
 * Matches the contract of `cfg.commands.ownerAllowFrom` (Array<string|number>);
 * we always emit strings since the UI input is a text field.
 */
export function cleanOwnerEntries(entries: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entries) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Read existing owner entries out of a config snapshot. Coerces numbers
 * (the schema is `Array<string | number>`) to strings so the UI works
 * uniformly with `string[]`.
 */
export function readOwnerEntriesFromConfig(cfg: unknown): string[] {
  if (!cfg || typeof cfg !== "object") {
    return [];
  }
  const commands = (cfg as { commands?: unknown }).commands;
  if (!commands || typeof commands !== "object") {
    return [];
  }
  const raw = (commands as { ownerAllowFrom?: unknown }).ownerAllowFrom;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (typeof entry === "number" && Number.isFinite(entry)) {
        return String(entry).trim();
      }
      return "";
    })
    .filter(Boolean);
}
