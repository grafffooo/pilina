// Locale-aware number formatting used across the UI (max 2 decimals, grouped thousands).

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string): Intl.NumberFormat {
  let f = cache.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    cache.set(locale, f);
  }
  return f;
}

export function formatNumber(value: number, locale = 'en'): string {
  return Number.isFinite(value) ? formatter(locale).format(value) : '–';
}

/** Millimetres to metres for long totals (cut length, edge banding), e.g. 16386 → "16.4 m". */
export function formatMetres(mm: number, locale = 'en'): string {
  if (!Number.isFinite(mm)) return '–';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mm / 1000)} m`;
}

/** Square millimetres to square metres, e.g. 2559200 → "2.56 m²". */
export function formatSquareMetres(mm2: number, locale = 'en'): string {
  if (!Number.isFinite(mm2)) return '–';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(mm2 / 1e6)} m²`;
}
