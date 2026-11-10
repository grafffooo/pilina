// Locale-aware number formatting used across the UI (max 2 decimals, grouped thousands).
// Without an explicit locale, the current interface language is used.
import { locale as current } from '../i18n';

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string): Intl.NumberFormat {
  let f = cache.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    cache.set(locale, f);
  }
  return f;
}

export function formatNumber(value: number, locale: string = current()): string {
  return Number.isFinite(value) ? formatter(locale).format(value) : '–';
}
