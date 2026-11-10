// Moving projects in and out: the old CutList (.md files or its browser storage) and
// this app's own project files for sharing (.pilina.json; older exports are .cutlist.json).
import type { Unit } from '../lib/units';
import type { Edges, Grain } from '../engine/types';
import { linkLegacyStockLabels, type EdgeBand, type Material } from './library';
import {
  emptyPart,
  emptyStock,
  migrate,
  newId,
  type PartRow,
  type Project,
  type StockRow,
} from './project';

/** Where the old app kept its projects in localStorage. */
export const OLD_STORAGE_KEY = 'cutlist_optimizer_projects_v1';

/** A project as the old single-file CutList stored it. */
export interface OldProject {
  id?: string;
  title?: string;
  updatedAt?: string;
  settings?: { kerf?: number; trim?: number; units?: string };
  parts?: {
    length?: number | string;
    width?: number | string;
    qty?: number | string;
    label?: string;
    grain?: string;
    enabled?: boolean;
    edges?: Partial<Edges>;
  }[];
  stock?: {
    length?: number | string;
    width?: number | string;
    qty?: number | string;
    label?: string;
    priority?: boolean;
    enabled?: boolean;
  }[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const bool = (cell: string | undefined, fallback: boolean) =>
  cell === undefined || cell === '' ? fallback : cell.trim().toLowerCase() !== 'false';

/** Parses the old app's Markdown export (front matter + Parts and Stock Panels tables). */
export function parseOldMarkdown(text: string, fileName = 'Imported project'): OldProject {
  const p: OldProject = {
    title: fileName.replace(/\.(md|markdown|txt)$/i, ''),
    settings: {},
    parts: [],
    stock: [],
  };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let front = false;
  let section = '';
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (i === 0 && line === '---') {
      front = true;
      return;
    }
    if (front) {
      if (line === '---') {
        front = false;
        return;
      }
      const m = /^([\w-]+)\s*:\s*(.+)$/.exec(line);
      if (!m) return;
      const [, key, val] = m as unknown as [string, string, string];
      const k = key.toLowerCase();
      if (k === 'title') p.title = val.trim();
      else if (k === 'id') p.id = val.trim();
      else if (k === 'updated') p.updatedAt = val.trim();
      else if (k === 'kerf') p.settings!.kerf = parseFloat(val);
      else if (k === 'trim') p.settings!.trim = parseFloat(val);
      else if (k === 'units') p.settings!.units = val.trim();
      return;
    }
    if (line.startsWith('# ')) {
      p.title = line.slice(2).trim() || p.title;
      return;
    }
    if (line.startsWith('## ')) {
      const s = line.slice(3).toLowerCase();
      section = s.includes('part')
        ? 'parts'
        : s.includes('stock') || s.includes('panel')
          ? 'stock'
          : '';
      return;
    }
    if (!line.startsWith('|') || !line.endsWith('|')) return;
    const c = line
      .slice(1, -1)
      .split('|')
      .map((x) => x.trim());
    if (c.length < 4 || c[0] === '#' || /^[-:]+$/.test(c[0]!) || /^[-:]+$/.test(c[1] ?? '')) return;
    if (section === 'parts') {
      p.parts!.push({
        length: c[1],
        width: c[2],
        qty: c[3],
        label: c[4] ?? '',
        grain: (c[5] ?? 'none').toLowerCase(),
        enabled: bool(c[6], true),
        edges: {
          top: bool(c[7], true),
          bottom: bool(c[8], true),
          left: bool(c[9], true),
          right: bool(c[10], true),
        },
      });
    } else if (section === 'stock') {
      p.stock!.push({
        length: c[1],
        width: c[2],
        qty: c[3],
        label: c[4] ?? '',
        priority: c[5] !== undefined ? c[5].toLowerCase() === 'true' : true,
        enabled: bool(c[6], true),
      });
    }
  });
  return p;
}

/** The old app's unit setting was only a label: its numbers are in that unit. */
export function oldUnit(units: string | undefined): Unit {
  const u = (units ?? '').trim().toLowerCase();
  if (/^(in|inch|inches|"|″)$/.test(u)) return 'in';
  if (u === 'cm') return 'cm';
  return 'mm';
}

const MM_PER_OLD_UNIT: Record<Unit, number> = { mm: 1, cm: 10, in: 25.4 };

/** The old app used 999 for "as many as needed". */
const UNLIMITED_FROM = 999;

/**
 * Converts old projects. Stock names become materials (reusing library materials of the
 * same name), so prices can be set once and apply everywhere.
 */
export function convertOldProjects(
  old: OldProject[],
  materials: Material[],
): { projects: Project[]; newMaterials: Material[]; units: Unit | null } {
  const units = new Map<Unit, number>();
  const projects = old.map((o) => {
    const unit = oldUnit(o.settings?.units);
    units.set(unit, (units.get(unit) ?? 0) + 1);
    const k = MM_PER_OLD_UNIT[unit];
    // Sizes in millimetres; `null` stays "not entered".
    const size = (v: unknown) => {
      const n = num(v);
      return n === null ? null : n * k;
    };
    const parts: PartRow[] = (o.parts ?? [])
      .filter((x) => num(x.length) || num(x.width) || x.label)
      .map((x) => {
        const grain = (['none', 'length', 'width'] as Grain[]).includes(x.grain as Grain)
          ? (x.grain as Grain)
          : 'none';
        return {
          ...emptyPart(),
          length: size(x.length),
          width: size(x.width),
          qty: num(x.qty) ?? 1,
          label: x.label ?? '',
          grain,
          enabled: x.enabled !== false,
          // The old app banded every edge unless told otherwise.
          edges: {
            top: x.edges?.top ?? true,
            bottom: x.edges?.bottom ?? true,
            left: x.edges?.left ?? true,
            right: x.edges?.right ?? true,
          },
        };
      });
    const stock: (StockRow & { label: string })[] = (o.stock ?? [])
      .filter((x) => num(x.length) || num(x.width))
      .map((x) => {
        const qty = num(x.qty);
        return {
          ...emptyStock(),
          length: size(x.length),
          width: size(x.width),
          qty: qty === null || qty >= UNLIMITED_FROM ? null : qty,
          priority: x.priority !== false,
          enabled: x.enabled !== false,
          label: x.label ?? '',
        };
      });
    const updated = Date.parse(o.updatedAt ?? '');
    const now = Date.now();
    return {
      id: o.id ? `old-${o.id}` : newId(),
      name: o.title || 'Imported project',
      createdAt: Number.isFinite(updated) ? updated : now,
      updatedAt: Number.isFinite(updated) ? updated : now,
      kerf: size(o.settings?.kerf) ?? 4,
      trim: o.settings?.trim && o.settings.trim > 0 ? o.settings.trim * k : 0,
      parts: parts.length ? parts : [emptyPart()],
      stock,
    };
  });
  const newMaterials = linkLegacyStockLabels(projects, materials);
  // The unit most of the projects were measured in, to offer as the setting.
  const top = [...units].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { projects: projects.map((p) => migrate(p)), newMaterials, units: top };
}

/** Reads the old app's storage array (as found in localStorage or pasted). */
export function parseOldStorage(json: string): OldProject[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error('Expected a list of projects');
  return data.filter((x): x is OldProject => typeof x === 'object' && x !== null && 'parts' in x);
}

// ---- This app's project files ----

// Kept from before the rename to Pilina, so older project files still import.
export const FILE_FORMAT = 'cutlist-project';
export const FILE_VERSION = 1;

export interface ProjectFile {
  format: typeof FILE_FORMAT;
  version: number;
  exportedAt: string;
  project: Project;
  /** Materials and bands the project refers to, so prices travel with it. */
  materials: Material[];
  edgeBands: EdgeBand[];
}

export function exportProjectFile(
  project: Project,
  materials: Material[],
  edgeBands: EdgeBand[],
): ProjectFile {
  const usedMaterials = new Set([
    ...project.stock.map((s) => s.materialId),
    ...project.parts.map((p) => p.materialId),
  ]);
  const usedBands = new Set([project.defaultEdgeBandId, ...project.parts.map((p) => p.edgeBandId)]);
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    materials: materials.filter((m) => usedMaterials.has(m.id)),
    edgeBands: edgeBands.filter((b) => usedBands.has(b.id)),
  };
}

export function isProjectFile(data: unknown): data is ProjectFile {
  return typeof data === 'object' && data !== null && (data as ProjectFile).format === FILE_FORMAT;
}

/**
 * Brings a shared project into this device's library. Materials and bands are matched by
 * id, then by name; unknown ones are added. The project gets a new id if it already exists.
 */
export function importProjectFile(
  file: ProjectFile,
  materials: Material[],
  edgeBands: EdgeBand[],
  existingIds: Set<string>,
): { project: Project; newMaterials: Material[]; newEdgeBands: EdgeBand[] } {
  const newMaterials: Material[] = [];
  const newEdgeBands: EdgeBand[] = [];
  const matMap = new Map<string, string>();
  for (const m of file.materials) {
    const found =
      materials.find((x) => x.id === m.id) ??
      materials.find((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase());
    if (found) matMap.set(m.id, found.id);
    else {
      newMaterials.push(m);
      matMap.set(m.id, m.id);
    }
  }
  const bandMap = new Map<string, string>();
  for (const b of file.edgeBands) {
    const found =
      edgeBands.find((x) => x.id === b.id) ??
      edgeBands.find((x) => x.name.trim().toLowerCase() === b.name.trim().toLowerCase());
    if (found) bandMap.set(b.id, found.id);
    else {
      newEdgeBands.push(b);
      bandMap.set(b.id, b.id);
    }
  }
  const mapM = (id: string | null) => (id ? (matMap.get(id) ?? null) : null);
  const mapB = (id: string | null) => (id ? (bandMap.get(id) ?? null) : null);
  const p = migrate(file.project);
  const project: Project = {
    ...p,
    id: existingIds.has(p.id) ? newId() : p.id,
    stock: p.stock.map((s) => ({ ...s, materialId: mapM(s.materialId) })),
    parts: p.parts.map((x) => ({
      ...x,
      materialId: mapM(x.materialId),
      edgeBandId: mapB(x.edgeBandId),
    })),
    defaultEdgeBandId: mapB(p.defaultEdgeBandId),
    cutAt: null,
  };
  return { project, newMaterials, newEdgeBands };
}

/** "Skrinky do dielne" → "skrinky-do-dielne". */
export function fileSlug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  );
}
