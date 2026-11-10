// Keeps this device and the linked folder in step: a sync runs shortly after every change,
// when the window comes back into focus, and once a minute. Each sync reads the whole folder
// and merges (see merge.ts); a few dozen small files take well under a second.
import { create } from 'zustand';
import { useStore } from '../store/store';
import {
  folderSupport,
  forgetFolder,
  pickFolder,
  rememberedFolder,
  type Folder,
  type FolderSupport,
} from './folder';
import { mergeFolder } from './merge';

export interface FolderSyncState {
  support: FolderSupport;
  state: 'off' | 'needs-permission' | 'syncing' | 'ok' | 'error';
  folderName: string | null;
  lastSync: number | null;
  error: string | null;
  unreadable: string[];
}

export const useFolderSync = create<FolderSyncState>(() => ({
  support: folderSupport(),
  state: 'off',
  folderName: null,
  lastSync: null,
  error: null,
  unreadable: [],
}));

const LIBRARY_AT = 'cutlist.folder.libraryAt';
const DELETIONS = 'cutlist.folder.deletions';
const CHANGE_DELAY_MS = 2500;
const EVERY_MS = 60_000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage the next sync just does a little more work.
  }
}

let folder: Folder | null = null;
let allow: (() => Promise<boolean>) | null = null;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Set while a sync applies its result, so those changes don't count as edits here. */
let applying = false;

function schedule(delay = CHANGE_DELAY_MS) {
  if (!folder || allow) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  if (!folder || allow) return;
  if (running) {
    again = true;
    return running;
  }
  const f = folder;
  useFolderSync.setState({ state: 'syncing' });
  running = (async () => {
    try {
      const files = await f.list();
      const { projects, materials, edgeBands, ready } = useStore.getState();
      if (!ready) return;
      const deletions = readJson<Record<string, number>>(DELETIONS, {});
      const result = mergeFolder({
        files,
        projects,
        materials,
        edgeBands,
        libraryAt: readJson<number>(LIBRARY_AT, 0),
        deletions,
      });
      for (const w of result.writes) await f.write(w.name, w.text);
      for (const name of result.removes) await f.remove(name).catch(() => {});
      writeJson(DELETIONS, {});
      writeJson(LIBRARY_AT, result.libraryAt);
      if (result.upsert.length || result.remove.length || result.library) {
        applying = true;
        try {
          useStore.getState().applySync(result);
        } finally {
          applying = false;
        }
      }
      useFolderSync.setState({
        state: 'ok',
        lastSync: Date.now(),
        error: null,
        unreadable: result.unreadable,
      });
    } catch (e) {
      console.error('Folder sync failed', e);
      useFolderSync.setState({
        state: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();
  await running;
  running = null;
  if (again) {
    again = false;
    await syncNow();
  }
}

let started = false;

/** Starts watching for changes; links up with the folder chosen earlier. Runs once. */
export async function startFolderSync() {
  if (started) return;
  started = true;
  useStore.subscribe((s, prev) => {
    if (applying || !folder) return;
    if (s.projects !== prev.projects) {
      const now = new Set(s.projects.map((p) => p.id));
      const removed = prev.projects.filter((p) => !now.has(p.id));
      if (removed.length) {
        const deletions = readJson<Record<string, number>>(DELETIONS, {});
        for (const p of removed) deletions[p.id] = Date.now();
        writeJson(DELETIONS, deletions);
      }
      schedule();
    }
    if (s.materials !== prev.materials || s.edgeBands !== prev.edgeBands) {
      writeJson(LIBRARY_AT, Date.now());
      schedule();
    }
  });
  window.addEventListener('focus', () => schedule(200));
  setInterval(() => schedule(0), EVERY_MS);

  const remembered = await rememberedFolder().catch(() => null);
  if (!remembered) return;
  folder = remembered.folder;
  allow = remembered.allow;
  useFolderSync.setState({
    folderName: folder.name,
    state: allow ? 'needs-permission' : 'syncing',
  });
  if (!allow) await syncNow();
}

/** Lets the user choose a folder (from a click), then syncs with it. */
export async function linkFolder(): Promise<void> {
  const picked = await pickFolder();
  if (!picked) return;
  folder = picked;
  allow = null;
  // A new folder: what was deleted here before doesn't concern it.
  writeJson(DELETIONS, {});
  useFolderSync.setState({ folderName: picked.name, state: 'syncing', error: null });
  await syncNow();
}

/** Chrome's permission prompt after a restart (from a click). */
export async function allowFolder(): Promise<void> {
  if (!allow) return;
  if (await allow()) {
    allow = null;
    await syncNow();
  }
}

/** Stops syncing. The folder and its files stay as they are. */
export async function unlinkFolder(): Promise<void> {
  clearTimeout(timer);
  folder = null;
  allow = null;
  await forgetFolder();
  useFolderSync.setState({
    state: 'off',
    folderName: null,
    lastSync: null,
    error: null,
    unreadable: [],
  });
}
