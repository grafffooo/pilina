// Human-readable descriptions of plan geometry, shared by the drawing and the lists.
import type { Cut, Placement, Rect } from '../engine/types';

/** Soft fills for part rows, readable on the light "paper" in both themes. */
export const PART_SWATCHES = [
  '#E6DCF0',
  '#F1E7CB',
  '#D2E8DF',
  '#DCE6F5',
  '#F5DADA',
  '#E1EDCF',
  '#F3E0CC',
  '#D6EEF0',
  '#EADCE8',
  '#E8E4D8',
];

export function swatch(index: number): string {
  return PART_SWATCHES[index % PART_SWATCHES.length]!;
}

export type CutKind = 'trim' | 'rip' | 'cross' | 'split' | 'part-trim';

export function cutKind(c: Cut): CutKind {
  switch (c.stage) {
    case 0:
      return 'trim';
    case 1:
      return 'rip';
    case 2:
      return 'cross';
    case 3:
      return 'split';
    default:
      return 'part-trim';
  }
}

export const CUT_KIND_LABEL: Record<CutKind, string> = {
  trim: 'Edge trim',
  rip: 'Rip, full length',
  cross: 'Cross cut',
  split: 'Split',
  'part-trim': 'Trim to size',
};

/** Rips (and edge trims) are drawn orange; every other cut is a red cross cut. */
export function isRipLike(c: Cut): boolean {
  return c.stage <= 1;
}

/** Where a piece lies, as a length × width pair (length = longer side). */
export function sizeOf(r: Rect): { long: number; short: number } {
  return { long: Math.max(r.w, r.h), short: Math.min(r.w, r.h) };
}

export type OffcutClass = 'usable' | 'strip' | 'scrap';

/** Rough reuse value of a leftover rectangle. */
export function classifyOffcut(r: Rect): OffcutClass {
  const { long, short } = sizeOf(r);
  if (short >= 100 && long >= 300) return 'usable';
  if (long >= 300 && short >= 30) return 'strip';
  return 'scrap';
}

/** Which rectangle sides carry the part's length edges (top/bottom) and width edges (left/right). */
export function edgeSides(p: Placement): {
  top: 'left' | 'top';
  bottom: 'right' | 'bottom';
  left: 'top' | 'left';
  right: 'bottom' | 'right';
} {
  // Not rotated: the part's length runs along the sheet's y axis, so its length edges are
  // the rectangle's left and right sides.
  return p.rotated
    ? { top: 'top', bottom: 'bottom', left: 'left', right: 'right' }
    : { top: 'left', bottom: 'right', left: 'top', right: 'bottom' };
}
