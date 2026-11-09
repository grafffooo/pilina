// App state: projects (saved to IndexedDB), undo history of the open project, and its results.
import { create } from 'zustand';
import * as storage from '../db/db';
import type { Job, Plan } from '../engine/types';
import { emptyHistory, record, redo, undo, type History } from '../model/history';
import {
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

interface AppState {
  ready: boolean;
  projects: Project[];
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
  setSummary(id: string, summary: ProjectSummary): void;
}

const LAST_PROJECT = 'cutlist.currentProject';
const SAVE_DELAY_MS = 400;

const dirty = new Set<string>();
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
    dirty.clear();
    const { projects } = get();
    try {
      for (const id of ids) {
        const p = projects.find((x) => x.id === id);
        if (p) await storage.saveProject(p);
      }
      if (dirty.size === 0) set({ saveState: 'saved', savedAt: Date.now() });
    } catch (e) {
      console.error('Saving failed', e);
      ids.forEach((id) => dirty.add(id));
      set({ saveState: 'error' });
    }
  }

  if (typeof window !== 'undefined') {
    // Don't lose the last keystrokes when the tab is closed or hidden.
    const flushNow = () => {
      if (dirty.size > 0) void flush();
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

  async function load() {
    let projects = await storage.loadProjects();
    if (projects.length === 0) {
      const first = newProject();
      await storage.saveProject(first);
      projects = [first];
    }
    const last = readLast();
    const current = projects.find((p) => p.id === last) ?? projects[0]!;
    set({ projects, ready: true, savedAt: Date.now() });
    open(current.id);
  }

  function open(id: string) {
    writeLast(id);
    set({ currentId: id, history: emptyHistory(), result: emptyResult });
  }

  return {
    ready: false,
    projects: [],
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
    },

    createProject() {
      const p = newProject();
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
        name: `${src.name} (copy)`,
        createdAt: now,
        updatedAt: now,
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

    setSummary(id, summary) {
      const p = get().projects.find((x) => x.id === id);
      if (!p) return;
      const old = p.summary;
      if (
        old &&
        old.pieces === summary.pieces &&
        old.sheets === summary.sheets &&
        Math.round(old.usedPct) === Math.round(summary.usedPct)
      ) {
        return;
      }
      replace({ ...p, summary });
      scheduleSave(id);
    },
  };
});

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
