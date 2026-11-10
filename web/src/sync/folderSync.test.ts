// The folder sync end to end against the real store and an in-memory IndexedDB, with an
// in-memory folder standing in for the one the user picks.
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../model/library';
import { newOffcut } from '../model/offcut';
import { useStore } from '../store/store';
import type { FolderFile } from './merge';
import { mergeWorkshop, OFFCUTS_FILE, RECORDS_FILE, SETTINGS_FILE } from './workshop';

const files = new Map<string, string>();

vi.mock('./folder', () => ({
  folderSupport: () => 'browser',
  forgetFolder: async () => {},
  rememberedFolder: async () => null,
  pickFolder: async () => ({
    name: 'Pilina',
    list: async (): Promise<FolderFile[]> => [...files].map(([name, text]) => ({ name, text })),
    write: async (name: string, text: string) => void files.set(name, text),
    remove: async (name: string) => void files.delete(name),
  }),
}));

const { linkFolder, useFolderSync } = await import('./folderSync');

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
});
