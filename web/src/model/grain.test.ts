import { describe, expect, it } from 'vitest';
import type { PartSpec } from '../engine/types';
import { projectToJob, unplacedReason } from './job';
import { materialGrain, newMaterial } from './library';
import { leftoverGrain, newOffcut, offcutStock } from './offcut';
import { emptyPart, newProject } from './project';

describe('material grain', () => {
  it('defaults to along the length, also for materials saved before grain existed', () => {
    expect(newMaterial('DTD Oak 18mm').grain).toBe('length');
    const old = { ...newMaterial('Old board') };
    delete old.grain;
    expect(materialGrain(old)).toBe('length');
  });

  it("goes into the job as the stock's grain", () => {
    const mdf = { ...newMaterial('MDF 16mm'), grain: 'none' as const };
    const project = newProject('Test', 0, mdf.id);
    project.parts = [{ ...emptyPart(), length: 600, width: 300, qty: 1, grain: 'length' }];
    expect(projectToJob(project, [mdf])!.stock[0]!.grain).toBe('none');
    // Stock without a material keeps the old rule.
    project.stock[0]!.materialId = null;
    expect(projectToJob(project, [mdf])!.stock[0]!.grain).toBe('length');
  });
});

describe('leftover grain', () => {
  // `w` runs across the sheet's width, `h` along its length.
  it('is along the offcut length when its long side follows the sheet grain', () => {
    expect(leftoverGrain({ x: 0, y: 0, w: 300, h: 2000 }, 'length')).toBe('length');
    expect(leftoverGrain({ x: 0, y: 0, w: 2000, h: 300 }, 'length')).toBe('width');
    expect(leftoverGrain({ x: 0, y: 0, w: 2000, h: 300 }, 'width')).toBe('length');
    expect(leftoverGrain({ x: 0, y: 0, w: 2000, h: 300 }, 'none')).toBe('none');
  });

  it('is freed by a material without grain, whatever the offcut recorded', () => {
    const mdf = { ...newMaterial('MDF'), grain: 'none' as const };
    const oak = newMaterial('Oak');
    const a = newOffcut(1, { length: 900, width: 400 }, { materialId: mdf.id, grain: 'width' });
    const b = newOffcut(2, { length: 900, width: 400 }, { materialId: oak.id, grain: 'width' });
    const c = newOffcut(3, { length: 900, width: 400 }, { materialId: oak.id });
    expect(offcutStock([a, b, c], [mdf, oak]).map((s) => s.grain)).toEqual([
      'none',
      'width',
      'length',
    ]);
  });
});

describe('why a part does not fit', () => {
  const part: PartSpec = { id: 'p', length: 600, width: 300, qty: 1, grain: 'length' };
  const job = (grain: 'length' | 'width' | 'none') => ({
    parts: [part],
    stock: [{ id: 's', length: 320, width: 650, grain }],
    kerf: 0,
    options: { timeBudgetMs: 10, seed: 1 },
  });

  it('accounts for the sheet grain', () => {
    // The part only fits with its length across the sheet's length.
    expect(unplacedReason(part, job('length'))).toBe('too-big');
    expect(unplacedReason(part, job('width'))).toBe('out-of-stock');
    expect(unplacedReason(part, job('none'))).toBe('out-of-stock');
  });
});
