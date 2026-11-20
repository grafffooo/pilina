import { describe, expect, it } from 'vitest';
import type { LinearPlan, Plan } from '../engine/types';
import { projectStatus } from './status';

// Two layouts, the first cut twice: three physical sheets.
const plan = { sheets: [{ qty: 2 }, { qty: 1 }] } as unknown as Plan;
const session = (sheet: number, cut: number, startedAt = 100) => ({ plan, sheet, cut, startedAt });
const linearPlan = { bars: [{ qty: 2 }] } as unknown as LinearPlan;
const linearSession = (bar: number, cut: number, startedAt = 100) => ({
  plan: linearPlan,
  bar,
  cut,
  startedAt,
});

describe('project status', () => {
  it('is a draft until cutting starts', () => {
    expect(projectStatus({ cutAt: null }, null)).toEqual({ kind: 'draft' });
    // Cut mode opened but no cut made yet.
    expect(projectStatus({ cutAt: null }, session(0, 0))).toEqual({ kind: 'draft' });
  });

  it('counts sheets while cutting', () => {
    expect(projectStatus({ cutAt: null }, session(0, 3))).toEqual({
      kind: 'cutting',
      done: 0,
      total: 3,
    });
    expect(projectStatus({ cutAt: null }, session(2, 0))).toMatchObject({ done: 2, total: 3 });
  });

  it('is cut once every sheet is done or it was marked cut', () => {
    expect(projectStatus({ cutAt: 500 }, session(3, 0))).toEqual({ kind: 'cut', at: 500 });
    expect(projectStatus({ cutAt: 500 }, null)).toEqual({ kind: 'cut', at: 500 });
    // An older session left over from before it was marked cut doesn't count.
    expect(projectStatus({ cutAt: 500 }, session(1, 0, 100))).toEqual({ kind: 'cut', at: 500 });
  });

  it('shows a new round of cutting on a cut project', () => {
    expect(projectStatus({ cutAt: 500 }, session(1, 0, 900))).toMatchObject({ kind: 'cutting' });
  });

  it('tracks linear sessions and combines active sheet and linear progress', () => {
    expect(projectStatus({ cutAt: null }, null, linearSession(0, 0))).toEqual({ kind: 'draft' });
    expect(projectStatus({ cutAt: null }, null, linearSession(0, 1))).toEqual({
      kind: 'cutting',
      done: 0,
      total: 2,
    });
    expect(projectStatus({ cutAt: null }, null, linearSession(1, 0))).toEqual({
      kind: 'cutting',
      done: 1,
      total: 2,
    });
    expect(projectStatus({ cutAt: 500 }, null, linearSession(2, 0))).toEqual({
      kind: 'cut',
      at: 500,
    });
    expect(projectStatus({ cutAt: 500 }, null, linearSession(0, 1, 100))).toEqual({
      kind: 'cut',
      at: 500,
    });
    expect(projectStatus({ cutAt: null }, session(1, 0), linearSession(1, 0))).toEqual({
      kind: 'cutting',
      done: 2,
      total: 5,
    });
  });
});
