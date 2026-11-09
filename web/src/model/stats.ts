// Statistics across projects, built from the cut records written in cut mode.
import type { CutRecord } from './cutRecord';
import { pricePerSqm, type Material } from './library';
import type { Offcut } from './offcut';

export type Range = '30d' | '90d' | '12m' | 'all';

export const RANGE_DAYS: Record<Range, number | null> = {
  '30d': 30,
  '90d': 90,
  '12m': 365,
  all: null,
};

export interface MonthStat {
  /** "2026-11" */
  key: string;
  /** First day of the month, local time. */
  start: number;
  sheets: number;
  /** Known cost only; `unpriced` counts sheets without a price. */
  cost: number;
  unpriced: number;
  sheetArea: number;
  usedArea: number;
  keptArea: number;
  /** Share of the sheet area neither used for parts nor kept as offcuts (0–100), null without sheets. */
  wastePct: number | null;
}

export interface MaterialStat {
  name: string;
  sheets: number;
  /** mm² of board cut. */
  sheetArea: number;
  cost: number;
}

export interface ProjectStat {
  projectId: string;
  name: string;
  sheets: number;
  usedPct: number;
  cost: number;
  unpriced: number;
  lastAt: number;
}

export interface Stats {
  sheets: number;
  cost: number;
  unpriced: number;
  sheetArea: number;
  usedArea: number;
  keptArea: number;
  usedPct: number | null;
  wastePct: number | null;
  /** Offcuts added to the library in the range. */
  offcutsKept: number;
  /** Library offcuts cut in the range. */
  offcutsReused: number;
  /** What the reused offcuts would have cost as new board, at today's prices. */
  saved: number;
  months: MonthStat[];
  materials: MaterialStat[];
  projects: ProjectStat[];
}

const monthKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthStart = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

export function computeStats(
  records: CutRecord[],
  offcuts: Offcut[],
  materials: Material[],
  range: Range,
  now = Date.now(),
): Stats {
  const days = RANGE_DAYS[range];
  const from = days === null ? -Infinity : now - days * 86_400_000;
  const inRange = records.filter((r) => r.at >= from && r.at <= now).sort((a, b) => a.at - b.at);
  const area = (r: CutRecord) => r.sheetLength * r.sheetWidth;
  const material = (id: string | null) => materials.find((m) => m.id === id);

  // Months: every month from the range start (or first record) to now, so gaps show as zero.
  const months = new Map<string, MonthStat>();
  const first = days === null ? (inRange[0]?.at ?? now) : from;
  for (
    let t = monthStart(first);
    t <= now;
    t = new Date(new Date(t).setMonth(new Date(t).getMonth() + 1)).getTime()
  ) {
    months.set(monthKey(t), {
      key: monthKey(t),
      start: t,
      sheets: 0,
      cost: 0,
      unpriced: 0,
      sheetArea: 0,
      usedArea: 0,
      keptArea: 0,
      wastePct: null,
    });
  }

  const byMaterial = new Map<string, MaterialStat>();
  const byProject = new Map<string, ProjectStat & { sheetArea: number; usedArea: number }>();
  let saved = 0;

  for (const r of inRange) {
    const m = months.get(monthKey(r.at));
    if (m) {
      m.sheets++;
      m.sheetArea += area(r);
      m.usedArea += r.usedArea;
      m.keptArea += r.keptArea;
      if (r.cost !== null) m.cost += r.cost;
      else if (!r.fromOffcut) m.unpriced++;
    }

    const mat = byMaterial.get(r.materialName) ?? {
      name: r.materialName,
      sheets: 0,
      sheetArea: 0,
      cost: 0,
    };
    mat.sheets++;
    mat.sheetArea += area(r);
    mat.cost += r.cost ?? 0;
    byMaterial.set(r.materialName, mat);

    const p = byProject.get(r.projectId) ?? {
      projectId: r.projectId,
      name: r.projectName,
      sheets: 0,
      usedPct: 0,
      cost: 0,
      unpriced: 0,
      lastAt: 0,
      sheetArea: 0,
      usedArea: 0,
    };
    p.sheets++;
    p.sheetArea += area(r);
    p.usedArea += r.usedArea;
    p.cost += r.cost ?? 0;
    if (r.cost === null && !r.fromOffcut) p.unpriced++;
    p.lastAt = Math.max(p.lastAt, r.at);
    p.name = r.projectName;
    byProject.set(r.projectId, p);

    if (r.fromOffcut) {
      const perSqm = pricePerSqm(material(r.materialId));
      if (perSqm !== null) saved += (area(r) / 1e6) * perSqm;
    }
  }

  for (const m of months.values()) {
    m.wastePct = m.sheets ? pct(m.sheetArea - m.usedArea - m.keptArea, m.sheetArea) : null;
  }

  const sheetArea = inRange.reduce((a, r) => a + area(r), 0);
  const usedArea = inRange.reduce((a, r) => a + r.usedArea, 0);
  const keptArea = inRange.reduce((a, r) => a + r.keptArea, 0);

  return {
    sheets: inRange.length,
    cost: inRange.reduce((a, r) => a + (r.cost ?? 0), 0),
    unpriced: inRange.filter((r) => r.cost === null && !r.fromOffcut).length,
    sheetArea,
    usedArea,
    keptArea,
    usedPct: pct(usedArea, sheetArea),
    wastePct: inRange.length ? pct(sheetArea - usedArea - keptArea, sheetArea) : null,
    offcutsKept: offcuts.filter(
      (o) => o.sourceProjectId && o.createdAt >= from && o.createdAt <= now,
    ).length,
    offcutsReused: inRange.filter((r) => r.fromOffcut).length,
    saved,
    months: [...months.values()],
    materials: [...byMaterial.values()].sort((a, b) => b.sheetArea - a.sheetArea),
    projects: [...byProject.values()]
      .map(({ sheetArea: a, usedArea: u, ...rest }) => ({
        ...rest,
        usedPct: a > 0 ? (u / a) * 100 : 0,
      }))
      .sort((a, b) => b.lastAt - a.lastAt),
  };
}

/** Round axis maximum and ticks: 0, step, 2·step … ≥ max (steps of 1, 2, 2.5 or 5 × 10ⁿ). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
