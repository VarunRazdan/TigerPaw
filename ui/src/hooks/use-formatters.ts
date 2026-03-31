import { useTranslation } from "react-i18next";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDate,
  formatCompactNumber,
} from "@/i18n/format";

export function useFormatters() {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  return {
    currency: (value: number, cur?: string) => formatCurrency(value, locale, cur),
    number: (value: number, opts?: Intl.NumberFormatOptions) => formatNumber(value, locale, opts),
    percent: (value: number) => formatPercent(value, locale),
    date: (date: Date | string | number, opts?: Intl.DateTimeFormatOptions) =>
      formatDate(date, locale, opts),
    compact: (value: number) => formatCompactNumber(value, locale),
  };
}
