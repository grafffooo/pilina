// Units for typing and showing sizes. Everything is stored and computed in millimetres;
// only the edges of the interface convert. Inches show as fractions (to 1/32″), as a
// tape measure reads, and long lengths and areas switch to feet and square feet.
import { locale as current } from '../i18n';

export type Unit = 'mm' | 'cm' | 'in';
export const UNITS: Unit[] = ['mm', 'cm', 'in'];

const MM_PER: Record<Unit, number> = { mm: 1, cm: 10, in: 25.4 };
const MM_PER_FOOT = 304.8;
/** Square metres in a square foot. */
export const SQM_PER_SQFT = 0.09290304;
/** Finest inch fraction shown. */
const FRACTION = 32;

let unit: Unit = 'mm';

/** The unit sizes are shown and typed in (follows the workshop setting). */
export const currentUnit = (): Unit => unit;
export function setCurrentUnit(next: Unit | undefined) {
  unit = next && UNITS.includes(next) ? next : 'mm';
}

export const isImperial = (u: Unit = unit) => u === 'in';

/** Short label after a size: "mm", "cm" or "in". */
export const unitLabel = (u: Unit = unit) => u;

const numberFormats = new Map<string, Intl.NumberFormat>();
function plain(value: number, digits: number, locale: string): string {
  const key = `${locale}|${digits}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, useGrouping: false });
    numberFormats.set(key, f);
  }
  return f.format(value);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Inches as a whole number plus a reduced fraction: 23.625 → "23 5/8". */
export function formatInches(inches: number): string {
  const sign = inches < 0 ? '-' : '';
  const steps = Math.round(Math.abs(inches) * FRACTION);
  const whole = Math.floor(steps / FRACTION);
  const rest = steps % FRACTION;
  if (rest === 0) return `${sign}${whole}`;
  const g = gcd(rest, FRACTION);
  const fraction = `${rest / g}/${FRACTION / g}`;
  return whole === 0 ? `${sign}${fraction}` : `${sign}${whole} ${fraction}`;
}

/** A size or position in the current unit, without the unit: "2800", "280", "110 1/4". */
export function formatLength(mm: number, u: Unit = unit, locale: string = current()): string {
  if (!Number.isFinite(mm)) return '–';
  if (u === 'in') return formatInches(mm / MM_PER.in);
  return plain(mm / MM_PER[u], 2, locale);
}

/** The same with its unit: "18 mm", "3/4 in". */
export const formatLengthUnit = (mm: number, u: Unit = unit) =>
  `${formatLength(mm, u)} ${unitLabel(u)}`;

/** Long totals (sawing, edge banding): metres, or feet in inches. */
export function formatLong(mm: number, u: Unit = unit, locale: string = current()): string {
  if (!Number.isFinite(mm)) return '–';
  const f = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return u === 'in' ? `${f.format(mm / MM_PER_FOOT)} ft` : `${f.format(mm / 1000)} m`;
}

/** Areas: square metres, or square feet in inches. */
export function formatArea(mm2: number, u: Unit = unit, locale: string = current()): string {
  if (!Number.isFinite(mm2)) return '–';
  const sqm = mm2 / 1e6;
  const f = new Intl.NumberFormat(locale, { maximumFractionDigits: u === 'in' ? 1 : 2 });
  return u === 'in' ? `${f.format(sqm / SQM_PER_SQFT)} ft²` : `${f.format(sqm)} m²`;
}

/** Unit of area prices: "m²" or "ft²". */
export const areaUnit = (u: Unit = unit) => (u === 'in' ? 'ft²' : 'm²');
/** Unit of length prices (edge banding): "m" or "ft". */
export const longUnit = (u: Unit = unit) => (u === 'in' ? 'ft' : 'm');

/** A price per m² as shown (per ft² in inches), and back. */
export const areaPriceOut = (perSqm: number, u: Unit = unit) =>
  u === 'in' ? perSqm * SQM_PER_SQFT : perSqm;
export const areaPriceIn = (shown: number, u: Unit = unit) =>
  u === 'in' ? shown / SQM_PER_SQFT : shown;
/** A price per metre as shown (per foot in inches), and back. */
export const longPriceOut = (perMetre: number, u: Unit = unit) =>
  u === 'in' ? (perMetre * MM_PER_FOOT) / 1000 : perMetre;
export const longPriceIn = (shown: number, u: Unit = unit) =>
  u === 'in' ? (shown * 1000) / MM_PER_FOOT : shown;

/** A plain decimal number, with a comma or a dot as the decimal separator. */
function decimal(text: string): number | null {
  // With a dot present, commas group thousands ("1,234.5"); a lone comma is a decimal point.
  const t = text.includes('.') ? text.replace(/,(?=\d{3}(?:\D|$))/g, '') : text.replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "23 5/8", "23-5/8", "5/8", "23.625" → inches (or whatever unit the number is in). */
function amount(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  let m = /^(\d+)\s*(?:\s|-)\s*(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) return Number(m[3]) === 0 ? null : Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2]);
  return decimal(t);
}

const SUFFIX: [RegExp, Unit | 'm' | 'ft'][] = [
  [/\s*mm$/i, 'mm'],
  [/\s*cm$/i, 'cm'],
  [/\s*m$/i, 'm'],
  [/\s*(?:in|inch|inches|"|″|”)$/i, 'in'],
  [/\s*(?:ft|feet|foot|'|′|’)$/i, 'ft'],
];

/**
 * What was typed, in millimetres; `null` when it isn't a size (yet). Numbers are in the
 * current unit unless a unit is typed after them ("600mm", "23 5/8\"", "2' 3 1/2\"").
 * Fractions work in every unit. In metric units spaces may group thousands ("2 800").
 */
export function parseLength(text: string, u: Unit = unit): number | null {
  let t = text.trim();
  if (t === '') return null;
  // Feet and inches: 2' 3 1/2"
  const feet = /^(\d+(?:[.,]\d+)?)\s*(?:ft|'|′|’)\s*(.+)$/i.exec(t);
  if (feet) {
    const ft = decimal(feet[1]!);
    const inches = parseLength(feet[2]!, 'in');
    return ft === null || inches === null ? null : ft * MM_PER_FOOT + inches;
  }
  let as: Unit | 'm' | 'ft' = u;
  for (const [re, which] of SUFFIX) {
    if (re.test(t)) {
      t = t.replace(re, '');
      as = which;
      break;
    }
  }
  // Metric: "2 800" is two thousand eight hundred, not a whole and a fraction.
  const n =
    as !== 'in' && as !== 'ft' && !t.includes('/') ? amount(t.replace(/\s/g, '')) : amount(t);
  if (n === null) return null;
  const mm = as === 'm' ? n * 1000 : as === 'ft' ? n * MM_PER_FOOT : n * MM_PER[as];
  return mm;
}
