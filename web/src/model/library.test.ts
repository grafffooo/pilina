import { describe, expect, it } from 'vitest';
import {
  buildLinearPriceInput,
  buildPriceInput,
  DEFAULT_SETTINGS,
  guessProfile,
  guessThickness,
  linearStockPrice,
  linkLegacyStockLabels,
  materialKind,
  newEdgeBand,
  newLinearMaterial,
  newMaterial,
  pricePerMetre,
  stockPrice,
} from './library';
import { emptyLinearStock, emptyPart, migrate, newProject } from './project';

describe('stockPrice', () => {
  const board = { ...newMaterial('DTD 18mm'), price: 45, sheetLength: 2800, sheetWidth: 2070 };

  it('uses the per-sheet price for the reference size, either way round', () => {
    expect(stockPrice('s', 2800, 2070, board).perSheet).toBe(45);
    expect(stockPrice('s', 2070, 2800, board).perSheet).toBe(45);
  });

  it('prices other sizes by area', () => {
    const p = stockPrice('s', 1400, 2070, board);
    expect(p.perSheet).toBeUndefined();
    expect(p.perSqm).toBeCloseTo(45 / 5.796, 6);
  });

  it('passes per-m² prices and flags missing ones', () => {
    expect(stockPrice('s', 100, 100, { ...board, priceUnit: 'sqm', price: 12 }).perSqm).toBe(12);
    const none = stockPrice('s', 100, 100, { ...board, price: null });
    expect(none.perSheet).toBeUndefined();
    expect(none.perSqm).toBeUndefined();
    expect(stockPrice('s', 100, 100, undefined).material).toBe('Unnamed material');
  });
});

describe('linkLegacyStockLabels', () => {
  it('turns free-text stock names into materials once, matching by name', () => {
    const existing = newMaterial('Oak 19mm');
    const raw = [
      { stock: [{ label: 'DTD Black 18mm', length: 2800, width: 2070 }, { label: 'oak 19MM' }] },
      { stock: [{ label: 'DTD Black 18mm' }, { label: '' }] },
    ];
    const created = linkLegacyStockLabels(raw, [existing]);
    expect(created.map((m) => m.name)).toEqual(['DTD Black 18mm']);
    expect(created[0]).toMatchObject({ thickness: 18, sheetLength: 2800, sheetWidth: 2070 });
    expect(raw[0]!.stock[0]!).toMatchObject({ materialId: created[0]!.id });
    expect(raw[0]!.stock[1]!).toMatchObject({ materialId: existing.id });
    expect(raw[1]!.stock[0]!).toMatchObject({ materialId: created[0]!.id });
    // `migrate` then drops the old label field.
    const p = migrate({ id: 'p', stock: raw[0]!.stock as never });
    expect('label' in p.stock[0]!).toBe(false);
  });
});

describe('buildPriceInput', () => {
  it('resolves bands per part, falling back to the project default', () => {
    const abs = { ...newEdgeBand('ABS'), pricePerMetre: 1.2 };
    const pvc = { ...newEdgeBand('PVC'), pricePerMetre: 0.8 };
    const p = newProject();
    p.defaultEdgeBandId = abs.id;
    p.parts = [
      { ...emptyPart(), id: 'a' },
      { ...emptyPart(), id: 'b', edgeBandId: pvc.id },
    ];
    p.pricing.extras = [{ id: 'x', label: 'Hinges', amount: 2.5, qty: 4 }];
    const input = buildPriceInput(p, [], [abs, pvc], DEFAULT_SETTINGS);
    expect(input.edgeBands).toEqual([
      { partId: 'a', band: 'ABS', perMetre: 1.2 },
      { partId: 'b', band: 'PVC', perMetre: 0.8 },
    ]);
    expect(input.extras).toEqual([{ label: 'Hinges', amount: 10 }]);
    expect(input.offcutRule).toEqual({ minLength: 300, minWidth: 100 });
  });
});

it('guesses thickness from a name', () => {
  expect(guessThickness('DTD Black 18mm')).toBe(18);
  expect(guessThickness('Plexi 3,5 mm')).toBe(3.5);
  expect(guessThickness('Oak')).toBeNull();
});

describe('linear materials and pricing', () => {
  it('defaults older materials without kind to sheet', () => {
    const legacy = { ...newMaterial('Old board') };
    delete legacy.kind;
    expect(materialKind(legacy)).toBe('sheet');
    expect(materialKind(undefined)).toBe('sheet');
    expect(materialKind(newLinearMaterial('KVH 45x95'))).toBe('linear');
  });

  it('guesses profile thickness and width from a name', () => {
    expect(guessProfile('KVH 45x95')).toEqual({ thickness: 45, profileWidth: 95 });
    expect(guessProfile('Spruce 28 × 48 mm')).toEqual({ thickness: 28, profileWidth: 48 });
    expect(guessProfile('Dowel 18mm')).toEqual({ thickness: 18, profileWidth: null });
    expect(guessProfile('Pine trim')).toEqual({ thickness: null, profileWidth: null });
  });

  it('prices per-piece at reference length and other lengths per metre', () => {
    const kvh = { ...newLinearMaterial('KVH 45x95'), price: 16, stockLength: 4000 };
    expect(linearStockPrice('s1', 4000, kvh).perPiece).toBe(16);
    expect(linearStockPrice('s1', 4000, kvh).perMetre).toBeUndefined();
    const cut = linearStockPrice('s2', 2500, kvh);
    expect(cut.perPiece).toBeUndefined();
    expect(cut.perMetre).toBeCloseTo(4, 6);
    expect(pricePerMetre(kvh)).toBeCloseTo(4, 6);

    const perM = { ...newLinearMaterial('Oak moulding'), priceUnit: 'metre' as const, price: 7.5 };
    expect(linearStockPrice('s3', 2400, perM).perMetre).toBe(7.5);
    expect(pricePerMetre(perM)).toBe(7.5);
    expect(linearStockPrice('s4', 2400, undefined).material).toBe('Unnamed material');
  });

  it('builds linear price input with includeExtras flag and offcut min length', () => {
    const kvh = { ...newLinearMaterial('KVH 45x95'), price: 16, stockLength: 4000 };
    const p = newProject();
    p.pricing.mode = 'area';
    p.pricing.extras = [{ id: 'x', label: 'Screws', amount: 5, qty: 2 }];
    p.linearStock = [{ ...emptyLinearStock(), id: 'b1', length: 4000, materialId: kvh.id }];

    const noExtras = buildLinearPriceInput(p, [kvh], DEFAULT_SETTINGS, [
      { id: 'oc-1', length: 1200, qty: 1, offcut: true, material: kvh.id },
    ]);
    expect(noExtras.mode).toBe('length');
    expect(noExtras.minOffcutLength).toBe(300);
    expect(noExtras.extras).toEqual([]);
    expect(noExtras.stock).toEqual([
      { stockId: 'b1', material: 'KVH 45x95', perPiece: 16 },
      { stockId: 'oc-1', material: 'KVH 45x95' },
    ]);

    const withExtras = buildLinearPriceInput(p, [kvh], DEFAULT_SETTINGS, [], true);
    expect(withExtras.extras).toEqual([{ label: 'Screws', amount: 10 }]);
  });
});
