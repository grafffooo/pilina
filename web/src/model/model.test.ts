import { describe, expect, it } from 'vitest';
import type { Placement } from '../engine/types';
import { edgeSides } from './describe';
import { emptyHistory, MERGE_WINDOW_MS, record, redo, undo } from './history';
import {
  linearUnplacedReason,
  linearUsedPercent,
  missingLinearPartFields,
  missingPartFields,
  projectToJob,
  projectToLinearJob,
  unplacedReason,
} from './job';
import { newLinearMaterial } from './library';
import { isMultiCell, parseLinearPartRows, parseNumber, parsePartRows } from './paste';
import {
  countPieces,
  emptyLinearPart,
  emptyLinearStock,
  emptyPart,
  hasLinearContent,
  migrate,
  newProject,
  SCHEMA_VERSION,
  type Project,
} from './project';

function skrinky(): Project {
  const p = newProject('Skrinky do dielne');
  p.parts = [
    { ...emptyPart(), length: 1000, width: 300, qty: 2, label: 'Sides' },
    { ...emptyPart(), length: 764, width: 300, qty: 10, label: 'Shelves and T/B' },
    { ...emptyPart(), length: 764, width: 80, qty: 2, label: 'Stretchers' },
    emptyPart(),
  ];
  return p;
}

describe('parseNumber', () => {
  it('reads dots, decimal commas and spaced thousands', () => {
    expect(parseNumber('18.5')).toBe(18.5);
    expect(parseNumber('18,5')).toBe(18.5);
    expect(parseNumber('2 800')).toBe(2800);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('parsePartRows', () => {
  it('reads spreadsheet rows and skips a header', () => {
    const rows = parsePartRows(
      'Length\tWidth\tQty\tLabel\n1000\t300\t2\tSides\n764\t80\t\tStretcher\n',
    );
    expect(rows.map((r) => [r.length, r.width, r.qty, r.label])).toEqual([
      [1000, 300, 2, 'Sides'],
      [764, 80, 1, 'Stretcher'],
    ]);
  });

  it('reads semicolon CSV with decimal commas', () => {
    const rows = parsePartRows('500;18,5;3;Strip');
    expect(rows[0]).toMatchObject({ length: 500, width: 18.5, qty: 3, label: 'Strip' });
  });

  it('knows single values from multi-cell pastes', () => {
    expect(isMultiCell('1000')).toBe(false);
    expect(isMultiCell('1000\t300')).toBe(true);
  });

  it('reads linear spreadsheet rows with Length/Qty/Label or Length/Label', () => {
    const rows = parseLinearPartRows(
      'Length\tQty\tLabel\n1200\t2\tLeg\n800\tRail\n650\t\tBrace\n',
    );
    expect(rows.map((r) => [r.length, r.qty, r.label])).toEqual([
      [1200, 2, 'Leg'],
      [800, 1, 'Rail'],
      [650, 1, 'Brace'],
    ]);
  });
});

describe('projectToJob', () => {
  it('sends only complete, enabled rows', () => {
    const p = skrinky();
    p.parts[1] = { ...p.parts[1]!, enabled: false };
    const job = projectToJob(p)!;
    expect(job.parts.map((x) => x.label)).toEqual(['Sides', 'Stretchers']);
    expect(job.stock).toHaveLength(1);
    expect(job.kerf).toBe(4);
  });

  it('returns null with nothing to cut', () => {
    expect(projectToJob(newProject())).toBeNull();
  });

  it('flags missing cells only on started rows', () => {
    expect(missingPartFields(emptyPart()).size).toBe(0);
    expect([...missingPartFields({ ...emptyPart(), length: 500 })]).toEqual(['width']);
  });

  it('explains why a part was not placed', () => {
    const job = projectToJob(skrinky())!;
    const big = { id: 'x', length: 3000, width: 300, qty: 1 };
    expect(unplacedReason(big, job)).toBe('too-big');
    expect(unplacedReason({ ...big, length: 2000 }, job)).toBe('out-of-stock');
    expect(unplacedReason({ ...big, length: 2500, grain: 'width' }, job)).toBe('too-big');

    // Multi-material: an Oak part checks only Oak (or untyped) stock, not bigger Pine stock.
    const multi = {
      kerf: 4,
      parts: [{ id: 'oak-panel', length: 1200, width: 500, qty: 1, material: 'oak' }],
      stock: [
        { id: 'pine-big', length: 2800, width: 2070, material: 'pine' },
        { id: 'oak-small', length: 1000, width: 500, material: 'oak' },
      ],
    };
    expect(unplacedReason(multi.parts[0]!, multi)).toBe('too-big');
    expect(
      unplacedReason({ id: 'oak-ok', length: 900, width: 400, qty: 1, material: 'oak' }, multi),
    ).toBe('out-of-stock');
    expect(
      unplacedReason(
        { id: 'oak-only-pine', length: 500, width: 300, qty: 1, material: 'oak' },
        { kerf: 4, parts: [], stock: [{ id: 'pine-big', length: 2800, width: 2070, material: 'pine' }] },
      ),
    ).toBe('too-big');
  });
});

describe('history', () => {
  it('merges quick edits of the same field into one undo step', () => {
    let h = emptyHistory<number>();
    h = record(h, 1, 'len', 1000);
    h = record(h, 2, 'len', 1500);
    expect(h.past).toEqual([1]);
    h = record(h, 3, 'len', 1500 + MERGE_WINDOW_MS + 1);
    expect(h.past).toEqual([1, 3]);
    h = record(h, 4, 'qty', 5000);
    expect(h.past).toEqual([1, 3, 4]);
  });

  it('undoes and redoes', () => {
    let h = record(emptyHistory<number>(), 1, null, 0);
    const u = undo(h, 2)!;
    expect(u.value).toBe(1);
    h = u.history;
    const r = redo(h, 1)!;
    expect(r.value).toBe(2);
    expect(undo(emptyHistory<number>(), 1)).toBeNull();
  });
});

describe('describe', () => {
  it('maps length edges onto the right rectangle sides', () => {
    const p: Placement = {
      partId: 'a',
      instance: 0,
      rect: { x: 0, y: 0, w: 300, h: 1000 },
      rotated: false,
    };
    expect(edgeSides(p).top).toBe('left');
    expect(edgeSides({ ...p, rotated: true }).top).toBe('top');
  });
});

describe('migrate', () => {
  it('fills fields missing from older records', () => {
    const p = migrate({ id: 'x', name: 'Old', parts: [{ id: 'a', length: 10 } as never] });
    expect(p.schema).toBe(SCHEMA_VERSION);
    expect(p.parts[0]).toMatchObject({ id: 'a', length: 10, enabled: true, grain: 'none' });
    expect(p.kerf).toBe(4);
    expect(p.linearKerf).toBe(3);
    expect(p.linearEndTrim).toBe(0);
    expect(p.linearStock).toEqual([]);
    expect(p.linearParts).toHaveLength(1);
    expect(hasLinearContent(p)).toBe(false);
  });
});

describe('linear project and job helpers', () => {
  it('counts sheet and linear pieces and tracks linear content', () => {
    const p = skrinky();
    p.linearParts = [
      { ...emptyLinearPart(), length: 1200, qty: 4, label: 'Stile' },
      { ...emptyLinearPart(), length: 800, qty: 2, enabled: false, label: 'Disabled' },
      emptyLinearPart(),
    ];
    expect(hasLinearContent(p)).toBe(true);
    expect(countPieces(p)).toBe(14 + 4);
  });

  it('builds a linear job with offcuts, endTrim, and material filters', () => {
    const kvh = newLinearMaterial('KVH 45x95');
    const p = newProject();
    p.linearEndTrim = 20;
    p.linearParts = [
      { ...emptyLinearPart(), length: 1500, qty: 2, label: 'Post', materialId: kvh.id },
      { ...emptyLinearPart(), length: 500, qty: 1, enabled: false, label: 'Off' },
    ];
    p.linearStock = [{ ...emptyLinearStock(), id: 'b1', length: 4000, materialId: kvh.id }];

    const job = projectToLinearJob(
      p,
      [kvh],
      [{ id: 'oc1', length: 1550, qty: 1, offcut: true, material: kvh.id }],
    )!;
    expect(job.kerf).toBe(3);
    expect(job.endTrim).toBe(20);
    expect(job.stock.map((s) => s.id)).toEqual(['oc1', 'b1']);
    expect(job.stock[1]!.label).toBe('KVH 45x95');

    expect(linearUnplacedReason({ id: 'p', length: 3970, qty: 1, material: kvh.id }, job)).toBe(
      'too-big',
    );
    expect(linearUnplacedReason({ id: 'p', length: 3960, qty: 1, material: kvh.id }, job)).toBe(
      'out-of-stock',
    );
    // Offcuts skip endTrim:
    expect(linearUnplacedReason({ id: 'p', length: 1550, qty: 1, material: kvh.id }, job)).toBe(
      'out-of-stock',
    );

    expect(missingLinearPartFields(emptyLinearPart()).size).toBe(0);
    expect([
      ...missingLinearPartFields({ ...emptyLinearPart(), label: 'Trim', qty: null }),
    ]).toEqual(['length', 'qty']);

    expect(
      linearUsedPercent({
        bars: [],
        unplaced: [],
        totals: {
          bars: 1,
          offcutsUsed: 0,
          stockLength: 4000,
          usedLength: 3000,
          wasteLength: 997,
          cuts: 2,
        },
      }),
    ).toBeCloseTo(75, 6);
  });
});
