/**
 * Locale-aware formatters using Intl APIs.
 * Arabic uses Western (Latin) numerals for financial data readability.
 */

function resolveOpts(locale: string): { numberingSystem?: string } {
  return locale === "ar" ? { numberingSystem: "latn" } : {};
}

export function formatCurrency(value: number, locale: string, currency = "USD"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    ...resolveOpts(locale),
  }).format(value);
}

export function formatNumber(
  value: number,
  locale: string,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, {
    ...opts,
    ...resolveOpts(locale),
  }).format(value);
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    ...resolveOpts(locale),
  }).format(value / 100);
}

export function formatDate(
  date: Date | string | number,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...opts,
  }).format(d);
}

export function formatCompactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
    ...resolveOpts(locale),
  }).format(value);
}
