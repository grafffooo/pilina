import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  autoMatchMaterial,
  buildPartRows,
  defaultSelectedBodyIds,
  evaluateExpr,
  groupByThickness,
  parseSolidCraftBytes,
  scParser,
} from './index';
import type { Material } from '../library';

function makeScArchive(doc: unknown): Uint8Array {
  return zipSync({
    'container.json': strToU8(JSON.stringify({ format: 'solidcraft-container/1' })),
    'document.json': strToU8(JSON.stringify(doc)),
  });
}

describe('evaluateExpr', () => {
  const params = new Map<string, number>([
    ['ply_T', 18],
    ['bench_H', 900],
    ['top_T', 25],
    ['tt', 50],
    ['mft_D', 700],
  ]);

  it('evaluates numbers, units, and arithmetic with params', () => {
    expect(evaluateExpr('18 mm', params)).toBe(18);
    expect(evaluateExpr('2 cm', params)).toBe(20);
    expect(evaluateExpr('bench_H - top_T', params)).toBe(875);
    expect(evaluateExpr('mft_D - 2*tt', params)).toBe(600);
    expect(evaluateExpr('(100 + 50) / 2', params)).toBe(75);
  });
});

describe('scParser', () => {
  const sampleDoc = {
    format: 'solidcraft/57',
    name: 'Test_Cabinet',
    units: 'mm',
    params: [
      { name: 'ply_T', expr: '18 mm', unit: 'mm' },
      { name: 'back_T', expr: '6 mm', unit: 'mm' },
    ],
    components: [
      { id: 1, name: 'Room_Reference', parent: 0 },
      { id: 2, name: 'Cabinet_A', parent: 0 },
    ],
    occurrences: [
      {
        id: 10,
        name: 'Room_Reference:1',
        component: 1,
        parent: 0,
        transform: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1],
        ],
      },
      {
        id: 11,
        name: 'Cabinet_A:1',
        component: 2,
        parent: 0,
        transform: [
          [1, 0, 0, 100],
          [0, 1, 0, 200],
          [0, 0, 1, 0],
          [0, 0, 0, 1],
        ],
      },
    ],
    features: [
      {
        id: 100,
        name: 'Wall_North',
        type: 'box',
        component: 1,
        operation: 'new_body',
        body_names: ['Wall_North'],
        corner: [0, 0, 0],
        length: '3000',
        width: '120',
        height: '2500',
      },
      {
        id: 101,
        name: 'Floor_Main',
        type: 'box',
        component: 1,
        operation: 'new_body',
        body_names: ['Floor_Main'],
        corner: [0, 0, -20],
        length: '3000',
        width: '3000',
        height: '20',
      },
      {
        id: 102,
        name: 'Shelf_1',
        type: 'box',
        component: 2,
        operation: 'new_body',
        body_names: ['Shelf_1'],
        corner: [0, 0, 300],
        length: '600',
        width: '400',
        height: 'ply_T',
      },
      {
        id: 103,
        name: 'Shelf_2',
        type: 'box',
        component: 2,
        operation: 'new_body',
        body_names: ['Shelf_2'],
        corner: [0, 0, 600],
        length: '600',
        width: '400',
        height: 'ply_T',
      },
      {
        id: 104,
        name: 'Back_Panel',
        type: 'box',
        component: 2,
        operation: 'new_body',
        body_names: ['Back_Panel'],
        corner: [0, 0, 0],
        length: '600',
        width: 'back_T',
        height: '800',
      },
      {
        id: 105,
        name: 'Notch_Cut',
        type: 'box',
        component: 2,
        operation: 'cut',
        corner: [0, 0, 0],
        length: '50',
        width: '50',
        height: '50',
      },
    ],
    appearances: {
      bodies: {
        Shelf_1: { color: [232, 213, 183], opacity: 1 },
      },
    },
    visibility: {
      hidden_bodies: ['Floor_Main'],
    },
  };

  it('detects .sc archives and parses bodies, transforms, and hidden flags', () => {
    const bytes = makeScArchive(sampleDoc);
    expect(scParser.canParse('Test_Cabinet.sc', bytes)).toBe(true);
    expect(scParser.canParse('other.stl', bytes)).toBe(false);

    const parsed = parseSolidCraftBytes(bytes, 'Test_Cabinet.sc');
    expect(parsed.name).toBe('Test_Cabinet');
    expect(parsed.bodies).toHaveLength(5); // Cut feature skipped

    const floor = parsed.bodies.find((b) => b.name === 'Floor_Main')!;
    expect(floor.hiddenInSource).toBe(true);
    expect(floor.dimensionsMm).toEqual([20, 3000, 3000]);

    const shelf1 = parsed.bodies.find((b) => b.name === 'Shelf_1')!;
    expect(shelf1.dimensionsMm).toEqual([18, 400, 600]);
    expect(shelf1.color).toEqual([232, 213, 183]);
    expect(shelf1.transform[12]).toBe(100);
    expect(shelf1.transform[13]).toBe(200);
  });

  it('groups by thickness ascending and applies smart default selection', () => {
    const parsed = parseSolidCraftBytes(makeScArchive(sampleDoc));
    const groups = groupByThickness(parsed.bodies);
    expect(groups.map((g) => g.thicknessMm)).toEqual([6, 18, 20, 120]);

    const selected = defaultSelectedBodyIds(parsed.bodies, 50);
    // Floor_Main is hiddenInSource, Wall_North is 120mm > 50mm
    expect(Array.from(selected).sort()).toEqual([
      '102:Shelf_1',
      '103:Shelf_2',
      '104:Back_Panel',
    ]);
  });

  it('auto-matches materials by thickness and merges identical parts', () => {
    const parsed = parseSolidCraftBytes(makeScArchive(sampleDoc));
    const selected = defaultSelectedBodyIds(parsed.bodies, 50);
    const materials: Material[] = [
      {
        id: 'mat-18',
        name: '18mm Birch',
        thickness: 18,
        color: '#d4a373',
        price: null,
        priceUnit: 'sheet',
        sheetLength: 2440,
        sheetWidth: 1220,
      },
    ];
    expect(autoMatchMaterial(18, materials)?.id).toBe('mat-18');
    expect(autoMatchMaterial(6, materials)).toBeNull();

    const tMap = new Map<string, string | null>([
      ['18', 'mat-18'],
      ['6', null],
    ]);

    const merged = buildPartRows(parsed.bodies, selected, tMap, {
      groupIdentical: true,
      scopeByComponent: true,
    });
    expect(merged).toHaveLength(2);
    const shelves = merged.find((p) => p.materialId === 'mat-18')!;
    expect(shelves.qty).toBe(2);
    expect(shelves.length).toBe(600);
    expect(shelves.width).toBe(400);

    const unmerged = buildPartRows(parsed.bodies, selected, tMap, {
      groupIdentical: false,
      scopeByComponent: true,
    });
    expect(unmerged).toHaveLength(3);
  });
});
