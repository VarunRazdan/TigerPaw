/**
 * Lightweight backend i18n module.
 *
 * Loads JSON translation files and provides a simple t() function with
 * {{variable}} interpolation. Falls back to English when a key is missing
 * in the target locale.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type TranslationBundle = Record<string, string>;
type NamespaceBundle = Record<string, TranslationBundle>;

const loadedLocales = new Map<string, NamespaceBundle>();
const NAMESPACES = ["extensions", "policy"] as const;

/**
 * Resolve the locales directory. When running from source (`src/i18n/`),
 * `./locales/` is a sibling directory. When bundled into `dist/trading/`,
 * walk up to the package root and use `src/i18n/locales/`.
 */
function resolveLocalesDir(): string {
  // Direct sibling — works in dev / ts-node / vitest
  const sibling = join(__dirname, "locales");
  if (existsSync(join(sibling, "en"))) {
    return sibling;
  }

  // Bundled: __dirname is dist/trading/ (or dist/something/) — walk up to find src/i18n/locales/
  let cursor = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = join(cursor, "src", "i18n", "locales");
    if (existsSync(join(candidate, "en"))) {
      return candidate;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }

  // Fallback — will silently miss translations (English keys returned as-is)
  return sibling;
}

const LOCALES_DIR = resolveLocalesDir();

function loadLocaleSync(lng: string): NamespaceBundle {
  const cached = loadedLocales.get(lng);
  if (cached) {
    return cached;
  }

  const bundle: NamespaceBundle = {};
  for (const ns of NAMESPACES) {
    try {
      const filePath = join(LOCALES_DIR, lng, `${ns}.json`);
      const raw = readFileSync(filePath, "utf-8");
      bundle[ns] = JSON.parse(raw) as TranslationBundle;
    } catch {
      // File doesn't exist for this locale — will fall back to English
    }
  }
  loadedLocales.set(lng, bundle);
  return bundle;
}

// Eagerly load English
loadLocaleSync("en");

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    if (val === undefined) {
      return `{{${key}}}`;
    }
    return typeof val === "string" ? val : JSON.stringify(val);
  });
}

/**
 * Create a translation function for a given locale and namespace.
 *
 * @param locale - Target locale (e.g. "de", "ja", "ar"). Falls back to "en".
 * @param namespace - Translation namespace (e.g. "extensions", "policy").
 * @returns A `t(key, vars?)` function that resolves translation keys.
 */
export function createT(
  locale: string,
  namespace: (typeof NAMESPACES)[number] = "extensions",
): (key: string, vars?: Record<string, unknown>) => string {
  const targetBundle = loadLocaleSync(locale);
  const enBundle = loadedLocales.get("en")!;

  return (key: string, vars?: Record<string, unknown>): string => {
    const template = targetBundle[namespace]?.[key] ?? enBundle[namespace]?.[key] ?? key;
    return interpolate(template, vars);
  };
}

/**
 * Get the configured locale from environment or config.
 * Defaults to "en".
 */
export function getConfiguredLocale(): string {
  return process.env.TIGERPAW_LOCALE ?? "en";
}

export const SUPPORTED_BACKEND_LOCALES = [
  "en",
  "de",
  "es",
  "fr",
  "pt-BR",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "ar",
] as const;
