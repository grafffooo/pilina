import { describe, expect, it } from 'vitest';
import type { SheetLayout } from '../engine/types';
import { cutPosition, measureFromPiece } from './cutMeasure';
import fixture from './fixtures/workshop-sheet.json';

// A real engine layout: 2800 × 2070, kerf 4, edge trim 10, shelves 760 × 520 in the first strip.
const sheet = fixture.sheet as SheetLayout;
const m = measureFromPiece(sheet, fixture.kerf);

describe('measuring from the last cut edge', () => {
  it('finds the piece every cut splits', () => {
    expect([...m.values()].filter((x) => x.fromSheet)).toEqual([]);
    expect(m.size).toBe(sheet.cuts.length);
    for (const x of m.values()) {
      expect(x.offset).toBeGreaterThanOrEqual(0);
      expect(x.offset).toBeLessThanOrEqual(x.pieceSize);
    }
  });

  it('gives the size of the piece coming off, not the distance from the sheet edge', () => {
    const cut = (n: number) => sheet.cuts.find((c) => c.number === n)!;
    // First rip: 760 shelf width from the trimmed edge (the sheet edge would say 772).
    expect(cut(5).pos).toBe(772);
    expect(m.get(5)!.offset).toBe(760);
    // Cross cuts down the strip: one shelf (520) each, from the previous cut.
    expect(cut(6).pos).toBe(532);
    expect(m.get(6)!.offset).toBe(520);
    expect(cut(7).pos).toBe(1056);
    expect(m.get(7)!.offset).toBe(520);
  });

  it('switches with the setting', () => {
    const c = sheet.cuts.find((x) => x.number === 7)!;
    expect(cutPosition(c, 'piece', m)).toBe(520);
    expect(cutPosition(c, 'sheet', m)).toBe(1056);
  });

  it('works without edge trim, from the sheet edge for the first cut', () => {
    const plain: SheetLayout = {
      stockId: 's',
      width: 1000,
      length: 1000,
      qty: 1,
      placements: [],
      waste: [],
      cuts: [
        {
          number: 1,
          stage: 1,
          axis: 'x',
          pos: 302,
          x1: 302,
          y1: 0,
          x2: 302,
          y2: 1000,
          length: 1000,
        },
        {
          number: 2,
          stage: 1,
          axis: 'x',
          pos: 606,
          x1: 606,
          y1: 0,
          x2: 606,
          y2: 1000,
          length: 1000,
        },
        { number: 3, stage: 2, axis: 'y', pos: 502, x1: 0, y1: 502, x2: 302, y2: 502, length: 302 },
      ],
    };
    const r = measureFromPiece(plain, 4);
    expect([1, 2, 3].map((n) => r.get(n)!.offset)).toEqual([300, 300, 500]);
  });
});
