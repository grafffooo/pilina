import { newId, NO_EDGES, type PartRow } from '../project';
import type { Material } from '../library';
import type { Model3DBody } from './types';

export interface ThicknessGroup {
  /** Rounded thickness in mm (e.g. 18, 25, 12.5). */
  thicknessMm: number;
  /** Human-readable key (e.g. "18" or "12.5"). */
  key: string;
  bodies: Model3DBody[];
}

export function roundDim(mm: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(mm * factor) / factor;
}

export function thicknessKey(thicknessMm: number): string {
  const rounded = roundDim(thicknessMm, 1);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Groups bodies by rounded thickness (ascending).
 */
export function groupByThickness(bodies: readonly Model3DBody[]): ThicknessGroup[] {
  const map = new Map<string, ThicknessGroup>();
  for (const body of bodies) {
    const t = roundDim(body.dimensionsMm[0], 1);
    const key = thicknessKey(t);
    let group = map.get(key);
    if (!group) {
      group = { thicknessMm: t, key, bodies: [] };
      map.set(key, group);
    }
    group.bodies.push(body);
  }
  return Array.from(map.values()).sort((a, b) => a.thicknessMm - b.thicknessMm);
}

/**
 * Computes initial selection: excludes bodies hidden in the source file
 * and bodies thicker than `maxThicknessMm`.
 */
export function defaultSelectedBodyIds(
  bodies: readonly Model3DBody[],
  maxThicknessMm = 50,
): Set<string> {
  const selected = new Set<string>();
  for (const body of bodies) {
    if (body.hiddenInSource) continue;
    if (roundDim(body.dimensionsMm[0], 1) > maxThicknessMm) continue;
    selected.add(body.id);
  }
  return selected;
}

/**
 * Finds the best matching Material in Pilina's library by thickness (±0.2 mm).
 */
export function autoMatchMaterial(
  thicknessMm: number,
  materials: readonly Material[],
): Material | null {
  let best: Material | null = null;
  let bestDiff = 0.25;
  for (const m of materials) {
    if (m.thickness == null) continue;
    const diff = Math.abs(m.thickness - thicknessMm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = m;
    }
  }
  return best;
}

export interface BuildPartRowsOptions {
  groupIdentical: boolean;
  scopeByComponent: boolean;
}

/**
 * Converts selected 3D bodies into Pilina `PartRow[]`.
 * Uses `dimensionsMm = [thickness, width, length]` -> `length` (longest), `width` (middle).
 */
export function buildPartRows(
  bodies: readonly Model3DBody[],
  selectedIds: ReadonlySet<string>,
  thicknessMaterialMap: ReadonlyMap<string, string | null>,
  options: BuildPartRowsOptions,
): PartRow[] {
  const chosen = bodies.filter((b) => selectedIds.has(b.id));
  if (!options.groupIdentical) {
    return chosen.map((b) => {
      const tKey = thicknessKey(b.dimensionsMm[0]);
      const materialId = thicknessMaterialMap.get(tKey) ?? null;
      return {
        id: newId(),
        length: roundDim(b.dimensionsMm[2], 1),
        width: roundDim(b.dimensionsMm[1], 1),
        qty: 1,
        label: b.name,
        grain: 'none',
        edges: { ...NO_EDGES },
        enabled: true,
        materialId,
        edgeBandId: null,
      };
    });
  }

  interface GroupBucket {
    length: number;
    width: number;
    materialId: string | null;
    componentName: string;
    names: string[];
    qty: number;
  }

  const buckets = new Map<string, GroupBucket>();
  for (const b of chosen) {
    const tKey = thicknessKey(b.dimensionsMm[0]);
    const materialId = thicknessMaterialMap.get(tKey) ?? null;
    const length = roundDim(b.dimensionsMm[2], 1);
    const width = roundDim(b.dimensionsMm[1], 1);
    const scope = options.scopeByComponent ? b.componentId : '*';
    const key = `${scope}|${materialId ?? ''}|${tKey}|${length}x${width}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        length,
        width,
        materialId,
        componentName: b.componentName,
        names: [],
        qty: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.qty += 1;
    bucket.names.push(b.name);
  }

  return Array.from(buckets.values()).map((bucket) => {
    const first = bucket.names[0] ?? '';
    const label =
      bucket.qty === 1
        ? first
        : options.scopeByComponent && bucket.componentName
          ? `${bucket.componentName} — ${first}`
          : first;
    return {
      id: newId(),
      length: bucket.length,
      width: bucket.width,
      qty: bucket.qty,
      label,
      grain: 'none',
      edges: { ...NO_EDGES },
      enabled: true,
      materialId: bucket.materialId,
      edgeBandId: null,
    };
  });
}
