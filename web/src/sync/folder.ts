// Reading and writing the linked folder. In the Mac app through Tauri's file access (the
// folder's path is remembered); in Chrome and Edge on a computer through the File System
// Access API (the folder handle is remembered in IndexedDB, and the browser asks for
// permission again after a restart). Safari, Firefox and phone browsers can't keep a folder.
import { isDesktopApp } from '../lib/platform';
import type { FolderFile } from './merge';

export interface Folder {
  /** The folder's name, for showing. */
  name: string;
  /** Every .json file in the folder (not in subfolders). */
  list(): Promise<FolderFile[]>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export type FolderSupport = 'mac' | 'browser' | null;

// The parts of the File System Access API used here (not in every TypeScript DOM library).
interface DirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showDirectoryPicker?: (o?: { mode?: string; id?: string }) => Promise<DirHandle>;
};

export function folderSupport(): FolderSupport {
  if (isDesktopApp()) return 'mac';
  if (
    typeof window !== 'undefined' &&
    typeof (window as PickerWindow).showDirectoryPicker === 'function'
  )
    return 'browser';
  return null;
}

// ---- Mac app ----

const PATH_KEY = 'cutlist.folder.path';

function macFolder(path: string): Folder {
  const fs = () => import('@tauri-apps/plugin-fs');
  const normalized = path.replace(/\\/g, '/');
  const at = (name: string) => `${normalized.replace(/\/+$/, '')}/${name}`;
  return {
    name: normalized.split('/').filter(Boolean).pop() ?? path,
    async list() {
      const { readDir, readTextFile } = await fs();
      const entries = await readDir(path);
      const names = entries.filter((e) => e.isFile && e.name.endsWith('.json')).map((e) => e.name);
      const files: FolderFile[] = [];
      for (const name of names) {
        try {
          files.push({ name, text: await readTextFile(at(name)) });
        } catch {
          // Not downloaded yet, or busy: the next sync picks it up.
        }
      }
      return files;
    },
    async write(name, text) {
      const { writeTextFile } = await fs();
      await writeTextFile(at(name), text);
    },
    async remove(name) {
      const { remove } = await fs();
      await remove(at(name));
    },
  };
}

// ---- Chrome / Edge ----

const DB = 'cutlist-folder';

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('handles');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('handles', mode);
      const req = run(tx.objectStore('handles'));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });
}

function browserFolder(dir: DirHandle): Folder {
  return {
    name: dir.name,
    async list() {
      const files: FolderFile[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        try {
          const file = await (await dir.getFileHandle(entry.name)).getFile();
          files.push({ name: entry.name, text: await file.text() });
        } catch {
          // Skipped this time.
        }
      }
      return files;
    },
    async write(name, text) {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
    async remove(name) {
      await dir.removeEntry(name);
    },
  };
}

// ---- Linking ----

/** Asks for a folder. Null when the dialog was cancelled. */
export async function pickFolder(): Promise<Folder | null> {
  if (folderSupport() === 'mac') {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ directory: true, multiple: false, recursive: false });
    if (typeof path !== 'string') return null;
    localStorage.setItem(PATH_KEY, path);
    return macFolder(path);
  }
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const dir = await picker({ mode: 'readwrite', id: 'pilina-sync' });
    await idb('readwrite', (s) => s.put(dir, 'folder'));
    return browserFolder(dir);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

export interface Remembered {
  folder: Folder;
  /** Chrome asks again after a restart; `allow()` must run from a click. */
  allow: (() => Promise<boolean>) | null;
}

/** The folder linked earlier, if any. */
export async function rememberedFolder(): Promise<Remembered | null> {
  if (folderSupport() === 'mac') {
    const path = localStorage.getItem(PATH_KEY);
    return path ? { folder: macFolder(path), allow: null } : null;
  }
  if (folderSupport() !== 'browser') return null;
  const dir = await idb<DirHandle | undefined>('readonly', (s) => s.get('folder')).catch(
    () => undefined,
  );
  if (!dir) return null;
  const granted = (await dir.queryPermission({ mode: 'readwrite' })) === 'granted';
  return {
    folder: browserFolder(dir),
    allow: granted
      ? null
      : async () => (await dir.requestPermission({ mode: 'readwrite' })) === 'granted',
  };
}

export async function forgetFolder() {
  localStorage.removeItem(PATH_KEY);
  if (folderSupport() === 'browser')
    await idb('readwrite', (s) => s.delete('folder')).catch(() => {});
}
