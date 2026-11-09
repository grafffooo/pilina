import { describe, expect, it } from 'vitest';
import type { CutRecord } from './cutRecord';
import { newMaterial } from './library';
import { newOffcut } from './offcut';
import { computeStats, niceTicks } from './stats';

const NOW = new Date(2026, 10, 20, 12).getTime(); // 20 Nov 2026
const day = 86_400_000;

function rec(at: number, fields: Partial<CutRecord> = {}): CutRecord {
  return {
    id: String(Math.random()),
    at,
    projectId: 'p1',
    projectName: 'Skrinky',
    materialId: 'm1',
    materialName: 'DTD 18mm',
    sheetLength: 2000,
    sheetWidth: 1000, // 2 m²
    usedArea: 1_000_000, // 1 m²
    keptArea: 500_000, // 0.5 m²
    fromOffcut: false,
    offcutCode: null,
    cost: 40,
    currency: 'EUR',
    ...fields,
  };
}

describe('computeStats', () => {
  const board = { ...newMaterial('DTD 18mm'), id: 'm1', price: 20, priceUnit: 'sqm' as const };
  const records = [
    rec(NOW - 2 * day),
    rec(NOW - 3 * day, { cost: null, projectId: 'p2', projectName: 'Stôl', materialName: 'Oak' }),
    rec(NOW - 5 * day, {
      fromOffcut: true,
      cost: null,
      sheetLength: 1000,
      sheetWidth: 500,
      usedArea: 400_000,
      keptArea: 0,
    }),
    rec(NOW - 60 * day),
    rec(NOW - 400 * day),
  ];

  it('totals the range and leaves offcut sheets out of "unpriced"', () => {
    const s = computeStats(records, [], [board], '30d', NOW);
    expect(s.sheets).toBe(3);
    expect(s.cost).toBe(40);
    expect(s.unpriced).toBe(1);
    expect(s.offcutsReused).toBe(1);
    // The reused 0.5 m² offcut would have cost 0.5 × 20.
    expect(s.saved).toBeCloseTo(10, 9);
    // 4.5 m² cut, 2.4 m² used, 1 m² kept → 1.1 m² waste.
    expect(s.usedPct).toBeCloseTo((2.4 / 4.5) * 100, 9);
    expect(s.wastePct).toBeCloseTo((1.1 / 4.5) * 100, 9);
  });

  it('fills every month of the range, including empty ones', () => {
    const s = computeStats(records, [], [board], '12m', NOW);
    expect(s.months.length).toBeGreaterThanOrEqual(12);
    expect(s.months.at(-1)!.key).toBe('2026-11');
    expect(s.months.at(-1)!.sheets).toBe(3);
    expect(s.months.find((m) => m.key === '2026-09')!.sheets).toBe(1);
    expect(s.months.find((m) => m.key === '2026-08')!.wastePct).toBeNull();
    expect(computeStats(records, [], [], 'all', NOW).sheets).toBe(5);
  });

  it('ranks materials and lists projects, newest first', () => {
    const s = computeStats(records, [], [board], '30d', NOW);
    expect(s.materials.map((m) => m.name)).toEqual(['DTD 18mm', 'Oak']);
    expect(s.projects.map((p) => [p.name, p.sheets])).toEqual([
      ['Skrinky', 2],
      ['Stôl', 1],
    ]);
  });

  it('counts offcuts kept from projects in the range', () => {
    const kept = {
      ...newOffcut(1, { length: 900, width: 400 }, {}, NOW - day),
      sourceProjectId: 'p1',
    };
    const manual = newOffcut(2, { length: 900, width: 400 }, {}, NOW - day);
    expect(computeStats([], [kept, manual], [], '30d', NOW).offcutsKept).toBe(1);
  });
});

it('makes round axis ticks', () => {
  expect(niceTicks(87)).toEqual([0, 25, 50, 75, 100]);
  expect(niceTicks(4)).toEqual([0, 1, 2, 3, 4]);
  expect(niceTicks(0)).toEqual([0, 1]);
});
