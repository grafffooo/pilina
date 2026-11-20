import { describe, expect, it } from 'vitest';
import { newLinearMaterial, newMaterial } from './library';
import {
  keepAdvice,
  labelFormat,
  labelOverflow,
  layoutLabels,
  linearKeepAdvice,
  linearOffcutStock,
  matchingLinearOffcuts,
  matchingOffcuts,
  newLinearOffcut,
  newOffcut,
  offcutCode,
  offcutIdFromStock,
  offcutKind,
  offcutStock,
  stickerPosition,
} from './offcut';
import { emptyLinearStock, newProject } from './project';

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
    expect(keepAdvice({ x: 0, y: 0, w: 914, h: 2800 })).toBe('suggested');
    expect(
      keepAdvice({ x: 0, y: 0, w: 250, h: 450 }, { offcutMinLength: 500, offcutMinWidth: 100 }),
    ).toBe('small');
    expect(
      keepAdvice({ x: 0, y: 0, w: 250, h: 450 }, { offcutMinLength: 400, offcutMinWidth: 200 }),
    ).toBe('suggested');
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

    // When a project has enabled sized stock without a material, loose offcuts match too.
    const plain = newProject(undefined, undefined, null);
    expect(matchingOffcuts(plain, [match, loose])).toEqual([loose]);

    const [stock] = offcutStock([match], [dtd]);
    expect(stock).toMatchObject({ qty: 1, offcut: true, material: dtd.id, label: 'OC-0001 · DTD' });
    expect(offcutIdFromStock(stock!.id)).toBe(match.id);
    expect(offcutIdFromStock('sheet-1')).toBeNull();
  });

  it('keeps sheet and linear offcuts strictly separate', () => {
    const dtd = newMaterial('DTD 18mm');
    const kvh = newLinearMaterial('KVH 45x95');
    const p = newProject(undefined, undefined, dtd.id);
    p.linearStock = [{ ...emptyLinearStock(), id: 'b1', length: 4000, materialId: kvh.id }];

    const sheetOc = { ...newOffcut(1, { length: 900, width: 400 }), materialId: dtd.id };
    const linearOc = { ...newLinearOffcut(2, 1200), materialId: kvh.id };
    const looseLinear = newLinearOffcut(3, 850);
    const legacySheet = { ...newOffcut(4, { length: 700, width: 350 }), materialId: dtd.id };
    delete legacySheet.kind;

    expect(offcutKind(legacySheet)).toBe('sheet');
    expect(offcutKind(linearOc)).toBe('linear');
    expect([linearOc.width, linearOc.length]).toEqual([0, 1200]);

    expect(matchingOffcuts(p, [sheetOc, linearOc, looseLinear, legacySheet])).toEqual([
      sheetOc,
      legacySheet,
    ]);
    expect(matchingLinearOffcuts(p, [sheetOc, linearOc, looseLinear, legacySheet])).toEqual([
      linearOc,
    ]);

    const untypedLinearProject = newProject();
    untypedLinearProject.linearStock = [{ ...emptyLinearStock(), length: 3000, materialId: null }];
    expect(matchingLinearOffcuts(untypedLinearProject, [linearOc, looseLinear])).toEqual([
      looseLinear,
    ]);

    const [barSpec] = linearOffcutStock([linearOc], [kvh]);
    expect(barSpec).toMatchObject({
      qty: 1,
      offcut: true,
      length: 1200,
      material: kvh.id,
      label: 'OC-0002 · KVH 45x95',
    });

    expect(linearKeepAdvice(300)).toBe('suggested');
    expect(linearKeepAdvice(299)).toBe('small');
    expect(linearKeepAdvice(450, 500)).toBe('small');
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

describe('custom sticker sheets', () => {
  it('uses the saved measurements, or a 3 × 8 to start from', () => {
    expect(labelFormat('custom', null)).toMatchObject({ id: 'custom', cols: 3, rows: 8 });
    const mine = { ...labelFormat('a4-2x7'), cols: 2, rows: 5, labelW: 100, labelH: 50 };
    expect(labelFormat('custom', mine)).toMatchObject({ id: 'custom', rows: 5, labelH: 50 });
  });

  it('says how far stickers run past the page', () => {
    expect(labelOverflow(labelFormat('a4-3x8'))).toEqual({ x: 0, y: 0 });
    const tooWide = { ...labelFormat('a4-3x8'), labelW: 75 };
    expect(labelOverflow(tooWide)).toEqual({ x: 15, y: 0 });
  });
});
