import { describe, expect, it } from 'vitest';
import {
  buildPriceInput,
  DEFAULT_SETTINGS,
  guessThickness,
  linkLegacyStockLabels,
  newEdgeBand,
  newMaterial,
  stockPrice,
} from './library';
import { emptyPart, migrate, newProject } from './project';

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
