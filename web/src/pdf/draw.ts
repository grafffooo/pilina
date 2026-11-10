// Drawing helpers shared by the PDF pages: A4 in points, with y measured down from the top
// of the page like the screen.
import { rgb, type PDFDocument, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { CostBreakdown, Job, Plan } from '../engine/types';
import type { MeasureFrom } from '../model/cutMeasure';
import type { Material } from '../model/library';
import type { Project } from '../model/project';

export interface PdfInput {
  project: Project;
  plan: Plan;
  job: Job;
  cost: CostBreakdown | null;
  materials: Material[];
  currency: string;
  /** Extra band length per banded edge, mm (the workshop setting). */
  edgeAllowance?: number;
  /** Cut positions from the last cut (default) or from the sheet edge. */
  cutMeasure?: MeasureFrom;
  /** For the header; injectable so tests are stable. */
  date?: Date;
}

export interface Ctx {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  input: PdfInput;
  partIndex: Map<string, number>;
}

// A4 portrait, points.
export const W = 595.28;
export const H = 841.89;
export const M = 40;

export const INK = hex('#2A2119');
export const INK_2 = hex('#5E5040');
export const INK_3 = hex('#7A6A57');
export const RULE = hex('#DCCFBB');
export const BOARD = hex('#EEE6D9');
export const PART_STROKE = hex('#6A5B4A');
export const RIP = hex('#DD6B0B');
export const CROSS = hex('#B42318');
export const ACCENT = hex('#8A5A34');
export const WARN = hex('#8A4300');

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Text helper with the y axis pointing down from the top of the page, like the screen. */
export function text(
  page: PDFPage,
  font: PDFFont,
  s: string,
  x: number,
  top: number,
  size: number,
  color: RGB = INK,
  align: 'left' | 'right' | 'center' = 'left',
) {
  const w = font.widthOfTextAtSize(s, size);
  const dx = align === 'right' ? -w : align === 'center' ? -w / 2 : 0;
  page.drawText(s, { x: x + dx, y: H - top - size * 0.8, size, font, color });
}

/** Shortens `s` with "…" until it fits `maxWidth`. */
export function clip(font: PDFFont, s: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export function rule(page: PDFPage, top: number, x1 = M, x2 = W - M) {
  page.drawLine({
    start: { x: x1, y: H - top },
    end: { x: x2, y: H - top },
    thickness: 0.5,
    color: RULE,
  });
}
