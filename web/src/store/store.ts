// App state: projects (saved to IndexedDB), undo history of the open project, and its results.
import { setCurrentUnit } from '../lib/units';
import { create } from 'zustand';
import { t } from '../i18n';
import * as storage from '../db/db';
import type { CostBreakdown, Job, Plan } from '../engine/types';
import type { CutRecord } from '../model/cutRecord';
import { emptyHistory, record, redo, undo, type History } from '../model/history';
import { newOffcut, type Offcut } from '../model/offcut';
import {
  DEFAULT_SETTINGS,
  linkLegacyStockLabels,
  newEdgeBand,
  newMaterial,
  type EdgeBand,
  type Material,
  type Settings,
} from '../model/library';
import {
  migrate,
  newId,
  newProject,
  type PartRow,
  type Project,
  type ProjectSummary,
  type StockRow,
} from '../model/project';

export type ResultStatus = 'empty' | 'running' | 'ready' | 'error';

export interface ResultState {
  status: ResultStatus;
  plan: Plan | null;
  /** The job the current plan belongs to. */
  job: Job | null;
  error: string | null;
}

export type SaveState = 'saved' | 'pending' | 'error';

/** Main area: the open project, the material and price library, the offcut library or label printing. */
export type MainView = 'project' | 'library' | 'offcuts' | 'labels' | 'stats';

interface AppState {
  ready: boolean;
  view: MainView;
  projects: Project[];
  materials: Material[];
  edgeBands: EdgeBand[];
  settings: Settings;
  offcuts: Offcut[];
  /** Cut mode is open for the current plan. */
  cutting: boolean;
  /** Cost of the current plan; `null` until priced. */
  cost: CostBreakdown | null;
  currentId: string | null;
  history: History<Project>;
  saveState: SaveState;
  savedAt: number | null;
  result: ResultState;

  init(): Promise<void>;
  select(id: string): void;
  createProject(): void;
  duplicateProject(id: string): void;
  deleteProject(id: string): Promise<void>;
  /** Applies an edit to the open project. Edits with the same `key` merge into one undo step. */
  edit(fn: (p: Project) => Project, key?: string | null): void;
  undo(): void;
  redo(): void;
  setResult(result: Partial<ResultState>): void;
  setSummary(id: string, summary: Partial<ProjectSummary>): void;
  setCost(cost: CostBreakdown | null): void;
  setView(view: MainView): void;
  /** Edits the shared library (not part of a project's undo history). */
  editLibrary(fn: (lib: Library) => Library): void;
  /** Adds offcuts, numbering them OC-0001, OC-0002, … in order. */
  addOffcuts(items: (Partial<Offcut> & { length: number; width: number })[]): Offcut[];
  updateOffcuts(ids: string[], patch: Partial<Offcut>): void;
  removeOffcut(id: string): void;
  setCutting(on: boolean): void;
  /** Adds imported projects (replacing ones with the same id) plus any new materials and bands. */
  importProjects(projects: Project[], materials: Material[], edgeBands: EdgeBand[]): void;
  /** Records a sheet as cut (for statistics); never blocks the workshop if saving fails. */
  recordCut(record: CutRecord): void;
}

export interface Library {
  materials: Material[];
  edgeBands: EdgeBand[];
  settings: Settings;
}

const LAST_PROJECT = 'cutlist.currentProject';
const SAVE_DELAY_MS = 400;

const dirty = new Set<string>();
let libraryDirty = false;
const offcutsChanged = new Set<string>();
const offcutsRemoved = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
}

function writeLast(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT, id);
  } catch {
    // Private mode: just don't remember the last project.
  }
}

const emptyResult: ResultState = { status: 'empty', plan: null, job: null, error: null };

export const useStore = create<AppState>()((set, get) => {
  function scheduleSave(id: string) {
    dirty.add(id);
    set({ saveState: 'pending' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  async function flush() {
    clearTimeout(saveTimer);
    const ids = [...dirty];
    const lib = libraryDirty;
    const changed = [...offcutsChanged];
    const removed = [...offcutsRemoved];
    dirty.clear();
    libraryDirty = false;
    offcutsChanged.clear();
    offcutsRemoved.clear();
    const { projects, materials, edgeBands, settings, offcuts } = get();
    try {
      for (const id of ids) {
        const p = projects.find((x) => x.id === id);
        if (p) await storage.saveProject(p);
      }
      if (lib) await storage.saveLibrary(materials, edgeBands, settings);
      if (changed.length || removed.length) {
        await storage.saveOffcuts(
          offcuts.filter((o) => changed.includes(o.id)),
          removed,
        );
      }
      if (
        dirty.size === 0 &&
        !libraryDirty &&
        offcutsChanged.size === 0 &&
        offcutsRemoved.size === 0
      ) {
        set({ saveState: 'saved', savedAt: Date.now() });
      }
    } catch (e) {
      console.error('Saving failed', e);
      ids.forEach((id) => dirty.add(id));
      libraryDirty ||= lib;
      changed.forEach((id) => offcutsChanged.add(id));
      removed.forEach((id) => offcutsRemoved.add(id));
      set({ saveState: 'error' });
    }
  }

  if (typeof window !== 'undefined') {
    // Don't lose the last keystrokes when the tab is closed or hidden.
    const flushNow = () => {
      if (dirty.size > 0 || libraryDirty || offcutsChanged.size > 0 || offcutsRemoved.size > 0) {
        void flush();
      }
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow();
    });
  }

  function replace(project: Project) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === project.id ? project : p)) }));
  }

  let initOnce: Promise<void> | undefined;

  function scheduleOffcutSave() {
    set({ saveState: 'pending' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  function scheduleLibrarySave() {
    libraryDirty = true;
    set({ saveState: 'pending' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  async function load() {
    // Local-only data: ask the browser not to evict it under storage pressure.
    if (typeof navigator !== 'undefined') navigator.storage?.persist?.().catch(() => {});
    const [raw, library, offcuts] = await Promise.all([
      storage.loadRawProjects(),
      storage.loadLibrary(),
      storage.loadOffcuts(),
    ]);
    let { materials } = library;
    const { edgeBands, settings } = library;

    // Older projects named their stock with free text: turn those names into materials.
    const created = linkLegacyStockLabels(raw, materials);
    let projects = raw.map(migrate);
    const outdated = raw.some((r) => r.schema !== projects[0]?.schema);

    if (projects.length === 0) {
      const board = materials[0] ?? newMaterial(t('Chipboard 18mm'));
      if (!materials[0]) {
        board.sheetLength = 2800;
        board.sheetWidth = 2070;
        created.push(board);
      }
      projects = [newProject(undefined, undefined, board.id)];
      await storage.saveProject(projects[0]!);
    } else if (outdated || created.length > 0) {
      await Promise.all(projects.map((p) => storage.saveProject(p)));
    }
    if (created.length > 0) {
      materials = [...materials, ...created];
      await storage.saveLibrary(materials, edgeBands, settings);
    }

    const last = readLast();
    const current = projects.find((p) => p.id === last) ?? projects[0]!;
    set({ projects, materials, edgeBands, settings, offcuts, ready: true, savedAt: Date.now() });
    open(current.id);
  }

  function open(id: string) {
    writeLast(id);
    set({
      currentId: id,
      history: emptyHistory(),
      result: emptyResult,
      cost: null,
      view: 'project',
      cutting: false,
    });
  }

  return {
    ready: false,
    view: 'project',
    projects: [],
    materials: [],
    edgeBands: [],
    settings: DEFAULT_SETTINGS,
    offcuts: [],
    cutting: false,
    cost: null,
    currentId: null,
    history: emptyHistory(),
    saveState: 'saved',
    savedAt: null,
    result: emptyResult,

    init() {
      // Runs once even if called twice (React StrictMode runs effects twice in development).
      initOnce ??= load();
      return initOnce;
    },

    select(id) {
      if (id !== get().currentId) open(id);
      else set({ view: 'project' });
    },

    createProject() {
      // Start on the board the open project uses, or the first material.
      const { projects, currentId, materials } = get();
      const active = projects.find((x) => x.id === currentId);
      const board = active?.stock.find((s) => s.materialId)?.materialId ?? materials[0]?.id ?? null;
      const p = newProject(undefined, undefined, board);
      set((s) => ({ projects: [p, ...s.projects] }));
      scheduleSave(p.id);
      open(p.id);
    },

    duplicateProject(id) {
      const src = get().projects.find((p) => p.id === id);
      if (!src) return;
      const now = Date.now();
      const copy: Project = {
        ...structuredClone(src),
        id: newId(),
        name: t('{{name}} (copy)', { name: src.name || t('Untitled project') }),
        createdAt: now,
        updatedAt: now,
        // The copy is a new plan, not something already cut.
        cutAt: null,
      };
      set((s) => ({ projects: [copy, ...s.projects] }));
      scheduleSave(copy.id);
      open(copy.id);
    },

    async deleteProject(id) {
      dirty.delete(id);
      await storage.deleteProject(id);
      const rest = get().projects.filter((p) => p.id !== id);
      if (rest.length === 0) {
        const fresh = newProject();
        rest.push(fresh);
        await storage.saveProject(fresh);
      }
      set({ projects: rest });
      if (get().currentId === id) open(rest[0]!.id);
    },

    edit(fn, key = null) {
      const { currentId, projects, history } = get();
      const before = projects.find((p) => p.id === currentId);
      if (!before) return;
      const after = fn(before);
      if (after === before) return;
      const now = Date.now();
      replace({ ...after, updatedAt: now });
      set({ history: record(history, before, key, now) });
      scheduleSave(before.id);
    },

    undo() {
      const { currentId, projects, history } = get();
      const current = projects.find((p) => p.id === currentId);
      const step = current && undo(history, current);
      if (!step) return;
      replace({ ...step.value, updatedAt: Date.now() });
      set({ history: step.history });
      scheduleSave(step.value.id);
    },

    redo() {
      const { currentId, projects, history } = get();
      const current = projects.find((p) => p.id === currentId);
      const step = current && redo(history, current);
      if (!step) return;
      replace({ ...step.value, updatedAt: Date.now() });
      set({ history: step.history });
      scheduleSave(step.value.id);
    },

    setResult(result) {
      set((s) => ({ result: { ...s.result, ...result } }));
    },

    setSummary(id, patch) {
      const p = get().projects.find((x) => x.id === id);
      if (!p) return;
      const old = p.summary ?? { pieces: 0, sheets: 0, usedPct: 0, cost: null };
      const next = { ...old, ...patch };
      if (
        p.summary &&
        old.pieces === next.pieces &&
        old.sheets === next.sheets &&
        Math.round(old.usedPct) === Math.round(next.usedPct) &&
        (old.cost ?? null) === (next.cost ?? null)
      ) {
        return;
      }
      replace({ ...p, summary: next });
      scheduleSave(id);
    },

    setCost(cost) {
      set({ cost });
    },

    setView(view) {
      set({ view });
    },

    addOffcuts(items) {
      const { settings } = get();
      let n = settings.nextOffcutNumber;
      const created = items.map(({ length, width, ...fields }) =>
        newOffcut(n++, { length, width }, fields),
      );
      set((s) => ({
        offcuts: [...s.offcuts, ...created],
        settings: { ...s.settings, nextOffcutNumber: n },
      }));
      created.forEach((o) => offcutsChanged.add(o.id));
      libraryDirty = true;
      scheduleOffcutSave();
      return created;
    },

    updateOffcuts(ids, patch) {
      set((s) => ({
        offcuts: s.offcuts.map((o) => (ids.includes(o.id) ? { ...o, ...patch } : o)),
      }));
      ids.forEach((id) => offcutsChanged.add(id));
      scheduleOffcutSave();
    },

    removeOffcut(id) {
      set((s) => ({ offcuts: s.offcuts.filter((o) => o.id !== id) }));
      offcutsChanged.delete(id);
      offcutsRemoved.add(id);
      scheduleOffcutSave();
    },

    importProjects(imported, newMaterials, newBands) {
      const ids = new Set(imported.map((p) => p.id));
      set((s) => ({
        projects: [...imported, ...s.projects.filter((p) => !ids.has(p.id))],
        materials: [...s.materials, ...newMaterials],
        edgeBands: [...s.edgeBands, ...newBands],
      }));
      imported.forEach((p) => dirty.add(p.id));
      if (newMaterials.length || newBands.length) libraryDirty = true;
      scheduleOffcutSave();
      if (imported[0]) open(imported[0].id);
    },

    setCutting(cutting) {
      set({ cutting });
    },

    recordCut(rec) {
      storage
        .addCutRecord(rec)
        .catch((e: unknown) => console.error('Could not save the cut record', e));
    },

    editLibrary(fn) {
      const { materials, edgeBands, settings } = get();
      const next = fn({ materials, edgeBands, settings });
      set(next);
      scheduleLibrarySave();
    },
  };
});

// Sizes everywhere are shown in the workshop's unit; keep the formatter in step with it.
setCurrentUnit(useStore.getState().settings.units);
useStore.subscribe((s) => setCurrentUnit(s.settings.units));

export function useCurrentProject(): Project | undefined {
  return useStore((s) => s.projects.find((p) => p.id === s.currentId));
}

// ---- Edit helpers for the open project ----

const edit = (fn: (p: Project) => Project, key?: string | null) =>
  useStore.getState().edit(fn, key);

export function updateProject(patch: Partial<Project>, key: string | null = null) {
  edit((p) => ({ ...p, ...patch }), key);
}

export function updatePart(id: string, patch: Partial<PartRow>, key: string | null = null) {
  edit((p) => ({ ...p, parts: p.parts.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), key);
}

export function insertParts(rows: PartRow[], afterId?: string) {
  edit((p) => {
    const i = afterId ? p.parts.findIndex((r) => r.id === afterId) : p.parts.length - 1;
    const parts = [...p.parts];
    parts.splice(i + 1, 0, ...rows);
    return { ...p, parts };
  });
}

/** Replaces the row with `rows` (used when pasting into an empty row). */
export function replacePart(id: string, rows: PartRow[]) {
  edit((p) => ({ ...p, parts: p.parts.flatMap((r) => (r.id === id ? rows : [r])) }));
}

export function removePart(id: string) {
  edit((p) => ({ ...p, parts: p.parts.filter((r) => r.id !== id) }));
}

export function duplicatePart(id: string) {
  edit((p) => {
    const i = p.parts.findIndex((r) => r.id === id);
    if (i < 0) return p;
    const parts = [...p.parts];
    parts.splice(i + 1, 0, { ...structuredClone(p.parts[i]!), id: newId() });
    return { ...p, parts };
  });
}

export function updateStock(id: string, patch: Partial<StockRow>, key: string | null = null) {
  edit((p) => ({ ...p, stock: p.stock.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), key);
}

export function addStock(row: StockRow) {
  edit((p) => ({ ...p, stock: [...p.stock, row] }));
}

export function removeStock(id: string) {
  edit((p) => ({ ...p, stock: p.stock.filter((r) => r.id !== id) }));
}

export function duplicateStock(id: string) {
  edit((p) => {
    const i = p.stock.findIndex((r) => r.id === id);
    if (i < 0) return p;
    const stock = [...p.stock];
    stock.splice(i + 1, 0, { ...structuredClone(p.stock[i]!), id: newId() });
    return { ...p, stock };
  });
}

// ---- Library helpers ----

const editLibrary = (fn: (lib: Library) => Library) => useStore.getState().editLibrary(fn);

export function addMaterial(name: string, sheet?: { length: number; width: number }): Material {
  const m = newMaterial(name, useStore.getState().materials.length);
  if (sheet) {
    m.sheetLength = sheet.length;
    m.sheetWidth = sheet.width;
  }
  editLibrary((l) => ({ ...l, materials: [...l.materials, m] }));
  return m;
}

export function updateMaterial(id: string, patch: Partial<Material>) {
  editLibrary((l) => ({
    ...l,
    materials: l.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }));
}

export function removeMaterial(id: string) {
  editLibrary((l) => ({ ...l, materials: l.materials.filter((m) => m.id !== id) }));
}

export function addEdgeBand(): EdgeBand {
  const b = newEdgeBand(
    useStore.getState().edgeBands.length === 0 ? 'ABS 2 mm' : t('New edge band'),
  );
  editLibrary((l) => ({ ...l, edgeBands: [...l.edgeBands, b] }));
  return b;
}

export function updateEdgeBand(id: string, patch: Partial<EdgeBand>) {
  editLibrary((l) => ({
    ...l,
    edgeBands: l.edgeBands.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  }));
}

export function removeEdgeBand(id: string) {
  editLibrary((l) => ({ ...l, edgeBands: l.edgeBands.filter((b) => b.id !== id) }));
}

export function updateSettings(patch: Partial<Settings>) {
  editLibrary((l) => ({ ...l, settings: { ...l.settings, ...patch } }));
}

export function updatePricing(patch: Partial<Project['pricing']>, key: string | null = null) {
  edit((p) => ({ ...p, pricing: { ...p.pricing, ...patch } }), key);
}
