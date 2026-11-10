import { describe, expect, it } from 'vitest';
import type { Cut, SheetLayout } from '../engine/types';
import { cutGroupTitle, cutPhase } from './cutPhase';

const cut = (number: number, stage: Cut['stage'], strip: number, axis: 'x' | 'y' = 'y'): Cut => ({
  number,
  stage,
  strip,
  axis,
  pos: 0,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  length: 0,
});

// Two strips side by side, ripped along the length: 600 and 400 wide.
const sheet: SheetLayout = {
  stockId: 's',
  width: 1003,
  length: 2000,
  qty: 1,
  placements: [],
  waste: [],
  strips: [
    { x: 0, y: 0, w: 600, h: 2000 },
    { x: 603, y: 0, w: 400, h: 2000 },
  ],
  cuts: [cut(1, 1, 1, 'x'), cut(2, 2, 1), cut(3, 3, 1, 'x'), cut(4, 2, 2), cut(5, 2, 2)],
};

describe('cut phases', () => {
  it('numbers the rips, then picks up each strip once', () => {
    expect(cutPhase(sheet, 0)).toEqual({ kind: 'rip', rip: 1, rips: 1 });
    expect(cutPhase(sheet, 1)).toMatchObject({
      kind: 'strip',
      strip: 1,
      strips: 2,
      width: 600,
      first: true,
    });
    expect(cutPhase(sheet, 2)).toMatchObject({ strip: 1, first: false });
    expect(cutPhase(sheet, 3)).toMatchObject({ strip: 2, width: 400, length: 2000, first: true });
    expect(cutPhase(sheet, 4)).toMatchObject({ strip: 2, first: false });
  });

  it('reads strips across a sheet laid out the other way', () => {
    const turned: SheetLayout = {
      ...sheet,
      strips: [{ x: 0, y: 0, w: 2000, h: 600 }],
      cuts: [cut(1, 1, 1, 'y'), cut(2, 2, 1, 'x')],
    };
    expect(cutPhase(turned, 1)).toMatchObject({ width: 600, length: 2000 });
  });

  it('says nothing about strips for plans without them', () => {
    const { strips: _, ...old } = sheet;
    expect(cutPhase(old, 1)).toBeNull();
    expect(cutPhase(old, 0)).toMatchObject({ kind: 'rip' });
  });

  it('heads the cut list where each strip starts', () => {
    const titles = sheet.cuts.map((_, i) => cutGroupTitle(sheet, i));
    expect(titles).toEqual([null, 'Strip 1 of 2', null, 'Strip 2 of 2', null]);
    const twoRips: SheetLayout = {
      ...sheet,
      cuts: [cut(1, 1, 1, 'x'), cut(2, 1, 2, 'x'), ...sheet.cuts.slice(1)],
    };
    expect(cutGroupTitle(twoRips, 0)).toBe('Rip cuts');
    expect(cutGroupTitle(twoRips, 1)).toBeNull();
  });
});
