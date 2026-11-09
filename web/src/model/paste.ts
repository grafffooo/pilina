// Parses rows pasted from a spreadsheet (tab separated) or CSV into part rows.
import { emptyPart, type PartRow } from './project';

/** Parses "1 234,5", "1234.5" or "18,5" style numbers; `null` when empty or invalid. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (t === '') return null;
  // A lone comma is a decimal separator (Slovak/Czech style); with a dot present, commas group.
  const normalized = t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** True when clipboard text looks like more than one cell. */
export function isMultiCell(text: string): boolean {
  return /[\t\n]/.test(text.trim());
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  return line.split(',');
}

/**
 * Columns in order: length, width, quantity, label. A first row whose length isn't a
 * number is treated as a header and skipped. Rows without a length and width are dropped.
 */
export function parsePartRows(text: string): PartRow[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim() !== '');
  const rows: PartRow[] = [];
  lines.forEach((line, i) => {
    const cells = splitRow(line).map((c) => c.trim());
    const length = parseNumber(cells[0] ?? '');
    const width = parseNumber(cells[1] ?? '');
    if (i === 0 && length === null) return; // header
    if (length === null || width === null) return;
    const qty = parseNumber(cells[2] ?? '');
    rows.push({
      ...emptyPart(),
      length,
      width,
      qty: qty === null ? 1 : Math.max(1, Math.round(qty)),
      label: cells.slice(3).join(' ').trim(),
    });
  });
  return rows;
}
