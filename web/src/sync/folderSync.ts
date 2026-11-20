// Keeps this device and the linked folder in step: a sync runs shortly after every change,
// when the window comes back into focus, and once a minute. Each sync reads the whole folder
// and merges (see merge.ts); a few dozen small files take well under a second.
import { create } from 'zustand';
import { setRecordListener, useStore } from '../store/store';
import {
  folderSupport,
  forgetFolder,
  pickFolder,
  rememberedFolder,
  type Folder,
  type FolderSupport,
} from './folder';
import * as storage from '../db/db';
import type { Settings } from '../model/library';
import { LIBRARY_FILE, mergeFolder } from './merge';
import { mergeWorkshop, OFFCUTS_FILE } from './workshop';

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
const LIBRARY_DELETIONS = 'cutlist.folder.libraryDeletions';
const SETTINGS_AT = 'cutlist.folder.settingsAt';
const OFFCUT_DELETIONS = 'cutlist.folder.offcutDeletions';
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

/** Removes only the deletion entries that were included in this sync, preserving concurrent edits. */
function clearProcessed(key: string, processed: Record<string, number>) {
  if (Object.keys(processed).length === 0) return;
  const current = readJson<Record<string, number>>(key, {});
  let changed = false;
  for (const [id, at] of Object.entries(processed)) {
    if (current[id] !== undefined && current[id] <= at) {
      delete current[id];
      changed = true;
    }
  }
  if (changed) writeJson(key, current);
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
      const { projects, materials, edgeBands, settings, offcuts, ready } = useStore.getState();
      if (!ready) return;
      const offcutDeletions = readJson<Record<string, number>>(OFFCUT_DELETIONS, {});
      const deletions = readJson<Record<string, number>>(DELETIONS, {});
      const libraryDeletions = readJson<Record<string, number>>(LIBRARY_DELETIONS, {});
      const workshop = mergeWorkshop({
        files,
        settings,
        settingsAt: readJson<number>(SETTINGS_AT, 0),
        offcuts,
        offcutDeletions,
        records: await storage.loadCutRecords(),
      });
      const result = mergeFolder({
        files,
        projects,
        materials,
        edgeBands,
        libraryAt: readJson<number>(LIBRARY_AT, 0),
        deletions,
        libraryDeletions,
      });
      for (const w of result.writes) await f.write(w.name, w.text);
      for (const name of result.removes) await f.remove(name).catch(() => {});
      for (const w of workshop.writes) await f.write(w.name, w.text);
      clearProcessed(DELETIONS, deletions);
      if (!result.unreadable.includes(LIBRARY_FILE)) {
        clearProcessed(LIBRARY_DELETIONS, libraryDeletions);
      }
      writeJson(LIBRARY_AT, Math.max(readJson<number>(LIBRARY_AT, 0), result.libraryAt));
      if (!workshop.unreadable.includes(OFFCUTS_FILE)) {
        clearProcessed(OFFCUT_DELETIONS, offcutDeletions);
      }
      writeJson(SETTINGS_AT, Math.max(readJson<number>(SETTINGS_AT, 0), workshop.settingsAt));
      await storage.addCutRecords(workshop.newRecords);
      if (result.upsert.length || result.remove.length || result.library) {
        applying = true;
        try {
          useStore.getState().applySync(result);
        } finally {
          applying = false;
        }
      }
      if (workshop.settings || workshop.offcutUpserts.length || workshop.offcutRemoves.length) {
        applying = true;
        try {
          useStore.getState().applyWorkshopSync(workshop);
        } finally {
          applying = false;
        }
      }
      useFolderSync.setState({
        state: 'ok',
        lastSync: Date.now(),
        error: null,
        unreadable: [...result.unreadable, ...workshop.unreadable],
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

const sameSettings = (a: Settings, b: Settings) =>
  JSON.stringify({ ...a, nextOffcutNumber: 0 }) === JSON.stringify({ ...b, nextOffcutNumber: 0 });

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
    if (s.offcuts !== prev.offcuts) {
      const now = new Set(s.offcuts.map((o) => o.id));
      const removed = prev.offcuts.filter((o) => !now.has(o.id));
      if (removed.length) {
        const deletions = readJson<Record<string, number>>(OFFCUT_DELETIONS, {});
        for (const o of removed) deletions[o.id] = Date.now();
        writeJson(OFFCUT_DELETIONS, deletions);
      }
      schedule();
    }
    if (s.settings !== prev.settings) {
      // The offcut counter goes up with every kept offcut; that alone isn't a settings change.
      if (!sameSettings(s.settings, prev.settings)) writeJson(SETTINGS_AT, Date.now());
      schedule();
    }
    if (s.materials !== prev.materials || s.edgeBands !== prev.edgeBands) {
      const matIds = new Set(s.materials.map((m) => m.id));
      const bandIds = new Set(s.edgeBands.map((b) => b.id));
      const removedIds = [
        ...prev.materials.filter((m) => !matIds.has(m.id)).map((m) => m.id),
        ...prev.edgeBands.filter((b) => !bandIds.has(b.id)).map((b) => b.id),
      ];
      if (removedIds.length) {
        const libDeletions = readJson<Record<string, number>>(LIBRARY_DELETIONS, {});
        const at = Date.now();
        for (const id of removedIds) libDeletions[id] = at;
        writeJson(LIBRARY_DELETIONS, libDeletions);
      }
      writeJson(LIBRARY_AT, Date.now());
      schedule();
    }
  });
  // Cut records live only in the database, not the store: sync soon after each one.
  setRecordListener(() => schedule());
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
  writeJson(LIBRARY_DELETIONS, {});
  writeJson(OFFCUT_DELETIONS, {});
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
