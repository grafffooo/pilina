// Which part of the sawing a cut belongs to, for cut mode: the rips on the whole sheet, or
// the cross cuts of one strip. With "rips first" every rip comes before any strip's cuts, so
// before each strip's first cut the woodworker picks that strip up from the stack.
import type { Cut, Rect, SheetLayout } from '../engine/types';
import { t } from '../i18n';

export type CutPhase =
  | { kind: 'trim' }
  | { kind: 'rip'; rip: number; rips: number }
  | {
      kind: 'strip';
      /** 1-based strip, of `strips`. */
      strip: number;
      strips: number;
      /** The strip's size: across the rips and along them, mm. */
      width: number;
      length: number;
      rect: Rect;
      /** This is the strip's first cut, after a cut somewhere else. */
      first: boolean;
    };

/** The phase of `sheet.cuts[index]`, or null for plans made before strips were recorded. */
export function cutPhase(sheet: SheetLayout, index: number): CutPhase | null {
  const c = sheet.cuts[index];
  if (!c) return null;
  if (c.stage === 0) return { kind: 'trim' };
  if (c.stage === 1) {
    const rips = sheet.cuts.filter((x) => x.stage === 1);
    return { kind: 'rip', rip: rips.indexOf(c) + 1, rips: rips.length };
  }
  const strips = sheet.strips ?? [];
  const rect = c.strip ? strips[c.strip - 1] : undefined;
  if (!rect) return null;
  const prev: Cut | undefined = sheet.cuts[index - 1];
  // Rips cut along the stock's length unless the sheet was laid out the other way.
  const ripAxis = sheet.cuts.find((x) => x.stage === 1)?.axis ?? 'x';
  return {
    kind: 'strip',
    strip: c.strip!,
    strips: strips.length,
    width: ripAxis === 'x' ? rect.w : rect.h,
    length: ripAxis === 'x' ? rect.h : rect.w,
    rect,
    first: !prev || prev.stage < 2 || prev.strip !== c.strip,
  };
}

/** A heading for the cut list before `sheet.cuts[index]`, where a new phase starts: the rips
 *  (when they come together) and each strip, on sheets with more than one strip. */
export function cutGroupTitle(sheet: SheetLayout, index: number): string | null {
  const p = cutPhase(sheet, index);
  if (!p) return null;
  if (p.kind === 'rip') {
    const prev = sheet.cuts[index - 1];
    const together = sheet.cuts
      .filter((c) => c.stage === 1)
      .every(
        (c, k, rips) => k === 0 || sheet.cuts.indexOf(c) === sheet.cuts.indexOf(rips[k - 1]!) + 1,
      );
    return p.rip === 1 && p.rips > 1 && together && prev?.stage !== 1 ? t('Rip cuts') : null;
  }
  if (p.kind === 'strip' && p.first && p.strips > 1)
    return t('Strip {{n}} of {{total}}', { n: p.strip, total: p.strips });
  return null;
}
