/**
 * Locale-aware text helpers for trading extensions.
 *
 * Wraps the backend i18n module's createT() function with the standard
 * txt() / txtD() response format used by all trading extension tools.
 */

import { createT, getConfiguredLocale } from "../i18n/index.js";

type ToolTextResult = {
  content: { type: "text"; text: string }[];
  details: unknown;
};

/**
 * Create locale-aware text helper functions for a trading extension.
 *
 * @param namespace - i18n namespace ("extensions" or "policy")
 * @param locale - Override locale (defaults to configured locale)
 */
export function createLocalizedHelpers(
  namespace: "extensions" | "policy" = "extensions",
  locale?: string,
) {
  const t = createT(locale ?? getConfiguredLocale(), namespace);

  return {
    /** Translation function — looks up key, interpolates {{vars}} */
    t,

    /** Wrap translated text as a tool result */
    txt(key: string, vars?: Record<string, unknown>): ToolTextResult {
      return {
        content: [{ type: "text" as const, text: t(key, vars) }],
        details: undefined as unknown,
      };
    },

    /** Wrap translated text as a tool result with structured details */
    txtD(key: string, details: unknown, vars?: Record<string, unknown>): ToolTextResult {
      return {
        content: [{ type: "text" as const, text: t(key, vars) }],
        details,
      };
    },

    /** Wrap a raw (pre-formatted) string as a tool result */
    rawTxt(text: string): ToolTextResult {
      return { content: [{ type: "text" as const, text }], details: undefined as unknown };
    },

    /** Wrap a raw string as a tool result with details */
    rawTxtD(text: string, details: unknown): ToolTextResult {
      return { content: [{ type: "text" as const, text }], details };
    },
  };
}
