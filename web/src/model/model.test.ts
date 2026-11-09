import { describe, expect, it } from 'vitest';
import type { Placement } from '../engine/types';
import { classifyOffcut, edgeSides } from './describe';
import { emptyHistory, MERGE_WINDOW_MS, record, redo, undo } from './history';
import { missingPartFields, projectToJob, unplacedReason } from './job';
import { isMultiCell, parseNumber, parsePartRows } from './paste';
import { emptyPart, migrate, newProject, type Project } from './project';

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
  it('classifies leftovers', () => {
    expect(classifyOffcut({ x: 0, y: 0, w: 914, h: 2800 })).toBe('usable');
    expect(classifyOffcut({ x: 0, y: 0, w: 80, h: 1264 })).toBe('strip');
    expect(classifyOffcut({ x: 0, y: 0, w: 24, h: 300 })).toBe('scrap');
  });

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
    expect(p.parts[0]).toMatchObject({ id: 'a', length: 10, enabled: true, grain: 'none' });
    expect(p.kerf).toBe(4);
  });
});
