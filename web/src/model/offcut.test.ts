import { describe, expect, it } from 'vitest';
import { newMaterial } from './library';
import {
  keepAdvice,
  labelFormat,
  layoutLabels,
  matchingOffcuts,
  newOffcut,
  offcutCode,
  offcutIdFromStock,
  offcutStock,
  stickerPosition,
} from './offcut';
import { newProject } from './project';

const rule = { offcutMinLength: 300, offcutMinWidth: 100 };

describe('offcuts', () => {
  it('numbers them OC-0001 and stores length ≥ width', () => {
    expect(offcutCode(13)).toBe('OC-0013');
    expect(offcutCode(12345)).toBe('OC-12345');
    const o = newOffcut(13, { length: 914, width: 2800 });
    expect([o.code, o.length, o.width, o.label]).toEqual(['OC-0013', 2800, 914, 'queued']);
  });

  it('advises which leftovers to keep', () => {
    expect(keepAdvice({ x: 0, y: 0, w: 914, h: 2800 }, rule)).toBe('suggested');
    expect(keepAdvice({ x: 0, y: 0, w: 80, h: 1264 }, rule)).toBe('strip');
    expect(keepAdvice({ x: 0, y: 0, w: 24, h: 300 }, rule)).toBe('small');
  });

  it('offers only available offcuts in a material the project uses', () => {
    const dtd = newMaterial('DTD');
    const mdf = newMaterial('MDF');
    const p = newProject(undefined, undefined, dtd.id);
    const match = { ...newOffcut(1, { length: 900, width: 400 }), materialId: dtd.id };
    const used = { ...match, id: 'u', status: 'used' as const };
    const other = { ...match, id: 'o', materialId: mdf.id };
    const loose = { ...match, id: 'l', materialId: null };
    const own = { ...match, id: 'own', sourceProjectId: p.id };
    expect(matchingOffcuts(p, [match, used, other, loose, own])).toEqual([match]);

    const [stock] = offcutStock([match], [dtd]);
    expect(stock).toMatchObject({ qty: 1, offcut: true, material: dtd.id, label: 'OC-0001 · DTD' });
    expect(offcutIdFromStock(stock!.id)).toBe(match.id);
    expect(offcutIdFromStock('sheet-1')).toBeNull();
  });
});

describe('labels', () => {
  const f = labelFormat('a4-3x8');

  it('places stickers on the A4 grid', () => {
    expect(stickerPosition(f, 0)).toEqual({ x: 0, y: 0.5 });
    expect(stickerPosition(f, 4)).toEqual({ x: 70, y: 37.5 });
    // The grid fills the page exactly.
    const last = stickerPosition(f, 23);
    expect(last.x + f.labelW).toBe(210);
    expect(last.y + f.labelH).toBeCloseTo(296.5, 6);
  });

  it('starts at a chosen sticker and spills onto new sheets', () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const a = layoutLabels(items, f, 7);
    expect(a.pages).toHaveLength(1);
    expect(a.pages[0]!.map((p) => p.index)).toEqual([6, 7, 8, 9, 10]);
    expect(a.nextStart).toBe(12);

    const b = layoutLabels(items, f, 22);
    expect(b.pages.map((p) => p.map((x) => x.index))).toEqual([
      [21, 22, 23],
      [0, 1],
    ]);
    expect(b.nextStart).toBe(3);

    expect(layoutLabels([1, 2, 3], f, 22).nextStart).toBe(1);
  });
});
