// Project → engine job, plus checks the editor uses to flag incomplete rows.
import type {
  CutOrder,
  Job,
  LinearJob,
  LinearPartSpec,
  LinearPlan,
  LinearStockSpec,
  PartSpec,
  Plan,
  StockSpec,
} from '../engine/types';
import { materialGrain, type Material } from './library';
import type {
  LinearPartRow,
  LinearStockRow,
  PartRow,
  Project,
  StockRow,
} from './project';

const positive = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;

export function partIsComplete(p: PartRow): boolean {
  return positive(p.length) && positive(p.width) && positive(p.qty);
}

export function stockIsComplete(s: StockRow): boolean {
  return positive(s.length) && positive(s.width) && (s.qty === null || positive(s.qty));
}

export function linearPartIsComplete(p: LinearPartRow): boolean {
  return positive(p.length) && positive(p.qty);
}

export function linearStockIsComplete(s: LinearStockRow): boolean {
  return positive(s.length) && (s.qty === null || positive(s.qty));
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

/** Which required cells of a linear part row are missing (only once the row has been started). */
export function missingLinearPartFields(p: LinearPartRow): Set<'length' | 'qty'> {
  const missing = new Set<'length' | 'qty'>();
  const started = p.length !== null || p.label.trim() !== '';
  if (!started) return missing;
  if (!positive(p.length)) missing.add('length');
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
  /** Library offcuts to use first (see `offcutStock`). */
  offcuts: StockSpec[] = [],
  {
    timeBudgetMs = 600,
    cutOrder = 'ripsFirst',
  }: { timeBudgetMs?: number; cutOrder?: CutOrder } = {},
): Job | null {
  const names = new Map(materials.map((m) => [m.id, m.name]));
  const byId = new Map(materials.map((m) => [m.id, m]));
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
  if (parts.length === 0) return null;
  const usedMaterials = new Set(parts.map((p) => p.material).filter((id): id is string => id !== null));
  const hasUnassigned = parts.some((p) => p.material === null);
  const legacyStock: StockSpec[] = project.stock
    .filter((s) => s.enabled && stockIsComplete(s))
    .filter((s) => hasUnassigned || (s.materialId !== null && usedMaterials.has(s.materialId)))
    .map((s) => ({
      id: s.id,
      length: s.length!,
      width: s.width!,
      qty: s.qty === null ? null : Math.floor(s.qty),
      priority: s.priority,
      material: s.materialId,
      label: (s.materialId && names.get(s.materialId)) || '',
      // Stock without a material keeps the old rule: grain along the sheet's length.
      grain: s.materialId ? materialGrain(byId.get(s.materialId)) : 'length',
    }));
  const coveredMaterials = new Set(
    legacyStock.map((s) => s.material).filter((id): id is string => id !== null),
  );
  const synthesized: StockSpec[] = [];
  for (const id of usedMaterials) {
    if (coveredMaterials.has(id)) continue;
    const m = byId.get(id);
    if (m && m.sheetLength && m.sheetLength > 0 && m.sheetWidth && m.sheetWidth > 0) {
      synthesized.push({
        id: `mat:${m.id}`,
        length: m.sheetLength,
        width: m.sheetWidth,
        qty: null,
        priority: true,
        material: m.id,
        label: m.name,
        grain: materialGrain(m),
      });
    }
  }
  const stock = [...synthesized, ...legacyStock];
  if (stock.length === 0) return null;
  return {
    parts,
    stock: project.useOffcuts ? [...offcuts, ...stock] : stock,
    kerf: Math.max(0, project.kerf || 0),
    trim: Math.max(0, project.trim || 0),
    options: { timeBudgetMs, seed: 1234567, cutOrder },
  };
}

/** Stable identity of a job, to skip re-running identical work. */
export function jobKey(job: Job | null): string {
  return job ? JSON.stringify(job) : '';
}

export type UnplacedReason = 'too-big' | 'out-of-stock';

/** Why a part didn't fit: bigger than every compatible sheet, or simply ran out of stock. */
export function unplacedReason(part: PartSpec, job: Job): UnplacedReason {
  const t = job.trim ?? 0;
  const fits = job.stock.some((s) => {
    if (part.material && s.material && part.material !== s.material) return false;
    const trim = s.offcut ? 0 : t;
    const w = s.width - 2 * trim;
    const l = s.length - 2 * trim;
    const along = part.width <= w && part.length <= l;
    const across = part.length <= w && part.width <= l;
    const sheetGrain = s.grain ?? 'length';
    const grain = part.grain ?? 'none';
    if (sheetGrain === 'none' || grain === 'none') return along || across;
    // The part's grain side has to run along the sheet's grain.
    return grain === sheetGrain ? along : across;
  });
  return fits ? 'out-of-stock' : 'too-big';
}

export function usedPercent(plan: Plan): number {
  const t = plan.totals;
  return t.sheetArea > 0 ? (t.usedArea / t.sheetArea) * 100 : 0;
}

/** Builds the 1D linear engine job, or `null` when there is nothing to optimize yet. */
export function projectToLinearJob(
  project: Project,
  materials: Material[] = [],
  offcuts: LinearStockSpec[] = [],
  { timeBudgetMs = 600 }: { timeBudgetMs?: number } = {},
): LinearJob | null {
  const names = new Map(materials.map((m) => [m.id, m.name]));
  const byId = new Map(materials.map((m) => [m.id, m]));
  const parts: LinearPartSpec[] = (project.linearParts ?? [])
    .filter((p) => p.enabled && linearPartIsComplete(p))
    .map((p) => ({
      id: p.id,
      length: p.length!,
      qty: Math.floor(p.qty!),
      label: p.label,
      material: p.materialId,
    }));
  if (parts.length === 0) return null;
  const usedMaterials = new Set(parts.map((p) => p.material).filter((id): id is string => id !== null));
  const hasUnassigned = parts.some((p) => p.material === null);
  const legacyStock: LinearStockSpec[] = (project.linearStock ?? [])
    .filter((s) => s.enabled && linearStockIsComplete(s))
    .filter((s) => hasUnassigned || (s.materialId !== null && usedMaterials.has(s.materialId)))
    .map((s) => ({
      id: s.id,
      length: s.length!,
      qty: s.qty === null ? null : Math.floor(s.qty),
      priority: s.priority,
      material: s.materialId,
      label: (s.materialId && names.get(s.materialId)) || '',
    }));
  const coveredMaterials = new Set(
    legacyStock.map((s) => s.material).filter((id): id is string => id !== null),
  );
  const synthesized: LinearStockSpec[] = [];
  for (const id of usedMaterials) {
    if (coveredMaterials.has(id)) continue;
    const m = byId.get(id);
    if (m && m.stockLength && m.stockLength > 0) {
      synthesized.push({
        id: `mat:${m.id}`,
        length: m.stockLength,
        qty: null,
        priority: true,
        material: m.id,
        label: m.name,
      });
    }
  }
  const stock = [...synthesized, ...legacyStock];
  const allStock = project.useOffcuts ? [...offcuts, ...stock] : stock;
  if (allStock.length === 0) return null;
  return {
    parts,
    stock: allStock,
    kerf: Math.max(0, project.linearKerf ?? 3),
    endTrim: Math.max(0, project.linearEndTrim ?? 0),
    options: { timeBudgetMs, seed: 1234567 },
  };
}

/** Stable identity of a linear job, to skip re-running identical work. */
export function linearJobKey(job: LinearJob | null): string {
  return job ? JSON.stringify(job) : '';
}

/** Why a linear part didn't fit: longer than every compatible bar, or ran out of bars. */
export function linearUnplacedReason(part: LinearPartSpec, job: LinearJob): UnplacedReason {
  const t = job.endTrim ?? 0;
  const fits = job.stock.some((s) => {
    if (part.material && s.material && part.material !== s.material) return false;
    const trim = s.offcut ? 0 : t;
    return part.length <= s.length - 2 * trim;
  });
  return fits ? 'out-of-stock' : 'too-big';
}

export function linearUsedPercent(plan: LinearPlan): number {
  const t = plan.totals;
  return t.stockLength > 0 ? (t.usedLength / t.stockLength) * 100 : 0;
}
