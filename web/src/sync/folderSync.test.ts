// The folder sync end to end against the real store and an in-memory IndexedDB, with an
// in-memory folder standing in for the one the user picks.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../model/library';
import { newOffcut } from '../model/offcut';
import { addEdgeBand, addMaterial, removeEdgeBand, removeMaterial, useStore } from '../store/store';
import type { FolderFile } from './merge';
import { LIBRARY_FILE } from './merge';
import { mergeWorkshop, OFFCUTS_FILE, RECORDS_FILE, SETTINGS_FILE } from './workshop';

const storageMap = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => void storageMap.set(k, v),
  removeItem: (k: string) => void storageMap.delete(k),
  clear: () => storageMap.clear(),
});
vi.stubGlobal('window', {
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
});

const files = new Map<string, string>();
let onWrite: ((name: string) => void) | null = null;

vi.mock('./folder', () => ({
  folderSupport: () => 'browser',
  forgetFolder: async () => {},
  rememberedFolder: async () => null,
  pickFolder: async () => ({
    name: 'Pilina',
    list: async (): Promise<FolderFile[]> => [...files].map(([name, text]) => ({ name, text })),
    write: async (name: string, text: string) => {
      files.set(name, text);
      onWrite?.(name);
    },
    remove: async (name: string) => void files.delete(name),
  }),
}));

const { linkFolder, startFolderSync, syncNow, useFolderSync } = await import('./folderSync');

beforeEach(() => {
  onWrite = null;
});

describe('folder sync with workshop data', () => {
  it('brings in another computer’s offcuts, records and settings, and adds this one’s', async () => {
    // Another computer synced first: one offcut, one cut record, inches.
    const theirs = {
      ...newOffcut(1, { length: 900, width: 400 }, { location: 'Rack B' }, 5),
      id: 'theirs',
    };
    const record = {
      id: 'rec-1',
      at: 5,
      projectId: 'p',
      projectName: 'Skrinka',
      materialId: null,
      materialName: 'DTD',
      sheetLength: 2800,
      sheetWidth: 2070,
      usedArea: 1,
      keptArea: 0,
      fromOffcut: false,
      offcutCode: null,
      cost: null,
      currency: 'EUR',
    };
    const other = mergeWorkshop({
      files: [],
      settings: { ...DEFAULT_SETTINGS, units: 'in', nextOffcutNumber: 2 },
      settingsAt: 100,
      offcuts: [theirs],
      offcutDeletions: {},
      records: [record],
    });
    for (const w of other.writes) files.set(w.name, w.text);

    // This computer kept its own OC-0001 before linking.
    await useStore.getState().init();
    const [mine] = useStore.getState().addOffcuts([{ length: 600, width: 300 }]);

    await linkFolder();
    expect(useFolderSync.getState()).toMatchObject({ state: 'ok', error: null });

    const s = useStore.getState();
    expect(s.settings.units).toBe('in');
    expect(s.offcuts.map((o) => o.id).sort()).toEqual([mine!.id, 'theirs'].sort());
    // Both were OC-0001: the one kept first (theirs) keeps it, this one moves on.
    expect(s.offcuts.find((o) => o.id === mine!.id)?.code).toBe('OC-0002');
    expect(s.settings.nextOffcutNumber).toBe(3);
    expect((await db.cutRecords.toArray()).map((r) => r.id)).toEqual(['rec-1']);

    const inFolder = JSON.parse(files.get(OFFCUTS_FILE)!) as { offcuts: { id: string }[] };
    expect(inFolder.offcuts.map((o) => o.id).sort()).toEqual([mine!.id, 'theirs'].sort());
    expect(files.has(SETTINGS_FILE) && files.has(RECORDS_FILE)).toBe(true);
  });

  it('tracks material and edge band deletions and preserves concurrent or skipped offcut deletions', async () => {
    await useStore.getState().init();
    await startFolderSync();
    await linkFolder();

    // Add and sync a material and edge band, then delete them.
    const mat = addMaterial('Oak 18mm');
    const band = addEdgeBand();
    await syncNow();
    expect(JSON.parse(files.get(LIBRARY_FILE)!).materials.some((m: { id: string }) => m.id === mat.id)).toBe(true);

    removeMaterial(mat.id);
    removeEdgeBand(band.id);
    await syncNow();
    const libAfter = JSON.parse(files.get(LIBRARY_FILE)!) as {
      materials: { id: string }[];
      edgeBands: { id: string }[];
      deleted: Record<string, number>;
    };
    expect(libAfter.materials.some((m) => m.id === mat.id)).toBe(false);
    expect(libAfter.edgeBands.some((b) => b.id === band.id)).toBe(false);
    expect(libAfter.deleted[mat.id]).toBeTypeOf('number');
    expect(libAfter.deleted[band.id]).toBeTypeOf('number');

    // Deleting an offcut while a sync is writing must not drop the in-flight deletion.
    const [a, b] = useStore.getState().addOffcuts([
      { length: 700, width: 300 },
      { length: 800, width: 300 },
    ]);
    await syncNow();

    useStore.getState().removeOffcut(a!.id);
    onWrite = (name) => {
      if (name === OFFCUTS_FILE) {
        onWrite = null;
        useStore.getState().removeOffcut(b!.id);
      }
    };
    await syncNow();
    // A second sync picks up `b` because its deletion was preserved rather than wiped.
    await syncNow();
    const offcutsAfter = JSON.parse(files.get(OFFCUTS_FILE)!) as { offcuts: { id: string }[] };
    expect(offcutsAfter.offcuts.some((o) => o.id === a!.id || o.id === b!.id)).toBe(false);

    // An unreadable offcuts file preserves local deletions until the file is readable again.
    const [c] = useStore.getState().addOffcuts([{ length: 900, width: 300 }]);
    await syncNow();
    const goodOffcuts = files.get(OFFCUTS_FILE)!;
    files.set(OFFCUTS_FILE, '{corrupt');
    useStore.getState().removeOffcut(c!.id);
    await syncNow();
    expect(useFolderSync.getState().unreadable).toContain(OFFCUTS_FILE);
    expect(JSON.parse(storageMap.get('cutlist.folder.offcutDeletions')!)[c!.id]).toBeTypeOf('number');

    files.set(OFFCUTS_FILE, goodOffcuts);
    await syncNow();
    const recovered = JSON.parse(files.get(OFFCUTS_FILE)!) as { offcuts: { id: string }[] };
    expect(recovered.offcuts.some((o) => o.id === c!.id)).toBe(false);
  });
});
