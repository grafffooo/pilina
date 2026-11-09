// Project → engine job, plus checks the editor uses to flag incomplete rows.
import type { Job, PartSpec, Plan, StockSpec } from '../engine/types';
import type { Material } from './library';
import type { PartRow, Project, StockRow } from './project';

const positive = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;

export function partIsComplete(p: PartRow): boolean {
  return positive(p.length) && positive(p.width) && positive(p.qty);
}

export function stockIsComplete(s: StockRow): boolean {
  return positive(s.length) && positive(s.width) && (s.qty === null || positive(s.qty));
}

/** Which required cells of a part row are missing (only once the row has been started). */
export function missingPartFields(p: PartRow): Set<'length' | 'width' | 'qty'> {
  const missing = new Set<'length' | 'width' | 'qty'>();
  const started = p.length !== null || p.width !== null || p.label.trim() !== '';
  if (!started) return missing;
  if (!positive(p.length)) missing.add('length');
  if (!positive(p.width)) missing.add('width');
  if (!positive(p.qty)) missing.add('qty');
  return missing;
}

/**
 * Builds the engine job, or `null` when there is nothing to optimize yet. Material ids are
 * the engine's material keys, so a part with a material only goes on that material's stock.
 */
export function projectToJob(
  project: Project,
  materials: Material[] = [],
  timeBudgetMs = 600,
): Job | null {
  const names = new Map(materials.map((m) => [m.id, m.name]));
  const parts: PartSpec[] = project.parts
    .filter((p) => p.enabled && partIsComplete(p))
    .map((p) => ({
      id: p.id,
      length: p.length!,
      width: p.width!,
      qty: Math.floor(p.qty!),
      label: p.label,
      grain: p.grain,
      edges: p.edges,
      material: p.materialId,
    }));
  const stock: StockSpec[] = project.stock
    .filter((s) => s.enabled && stockIsComplete(s))
    .map((s) => ({
      id: s.id,
      length: s.length!,
      width: s.width!,
      qty: s.qty === null ? null : Math.floor(s.qty),
      priority: s.priority,
      material: s.materialId,
      label: (s.materialId && names.get(s.materialId)) || '',
    }));
  if (parts.length === 0 || stock.length === 0) return null;
  return {
    parts,
    stock,
    kerf: Math.max(0, project.kerf || 0),
    trim: Math.max(0, project.trim || 0),
    options: { timeBudgetMs, seed: 1234567 },
  };
}

/** Stable identity of a job, to skip re-running identical work. */
export function jobKey(job: Job | null): string {
  return job ? JSON.stringify(job) : '';
}

export type UnplacedReason = 'too-big' | 'out-of-stock';

/** Why a part didn't fit: bigger than every usable sheet, or simply ran out of stock. */
export function unplacedReason(part: PartSpec, job: Job): UnplacedReason {
  const t = job.trim ?? 0;
  const fits = job.stock.some((s) => {
    const w = s.width - 2 * t;
    const l = s.length - 2 * t;
    const along = part.width <= w && part.length <= l;
    const across = part.length <= w && part.width <= l;
    if (part.grain === 'length') return along;
    if (part.grain === 'width') return across;
    return along || across;
  });
  return fits ? 'out-of-stock' : 'too-big';
}

export function usedPercent(plan: Plan): number {
  const t = plan.totals;
  return t.sheetArea > 0 ? (t.usedArea / t.sheetArea) * 100 : 0;
}
