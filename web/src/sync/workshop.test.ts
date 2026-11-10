import { describe, expect, it } from 'vitest';
import type { CutRecord } from '../model/cutRecord';
import { DEFAULT_SETTINGS, type Settings } from '../model/library';
import { newOffcut, type Offcut } from '../model/offcut';
import type { FolderFile } from './merge';
import {
  mergeWorkshop,
  OFFCUTS_FILE,
  RECORDS_FILE,
  SETTINGS_FILE,
  type WorkshopInput,
  type WorkshopResult,
} from './workshop';

const offcut = (n: number, id: string, at: number, fields: Partial<Offcut> = {}): Offcut => ({
  ...newOffcut(n, { length: 800, width: 300 }, fields, at),
  id,
});

const record = (id: string, at: number): CutRecord => ({
  id,
  at,
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
});

const device = (over: Partial<WorkshopInput> = {}): WorkshopInput => ({
  files: [],
  settings: DEFAULT_SETTINGS,
  settingsAt: 0,
  offcuts: [],
  offcutDeletions: {},
  records: [],
  ...over,
});

/** The folder after a sync: its files with the sync's writes applied. */
function after(files: FolderFile[], r: WorkshopResult): FolderFile[] {
  const out = new Map(files.map((f) => [f.name, f]));
  for (const w of r.writes) out.set(w.name, w);
  return [...out.values()];
}

/** This device after applying a sync's result. */
function applied(d: WorkshopInput, r: WorkshopResult): WorkshopInput {
  const gone = new Set(r.offcutRemoves);
  const incoming = new Map(r.offcutUpserts.map((o) => [o.id, o]));
  const known = new Set(d.offcuts.map((o) => o.id));
  return {
    ...d,
    files: after(d.files, r),
    settings: r.settings ?? d.settings,
    settingsAt: r.settingsAt,
    offcuts: [
      ...d.offcuts.filter((o) => !gone.has(o.id)).map((o) => incoming.get(o.id) ?? o),
      ...r.offcutUpserts.filter((o) => !known.has(o.id)),
    ],
    offcutDeletions: {},
    records: [...d.records, ...r.newRecords],
  };
}

const names = (r: WorkshopResult) => r.writes.map((w) => w.name).sort();
const codes = (os: Offcut[]) => os.map((o) => `${o.id}:${o.code}`).sort();

describe('syncing offcuts, cut records and settings', () => {
  it('writes all three files to an empty folder, and nothing on the next sync', () => {
    const d = device({ offcuts: [offcut(1, 'a', 10)], records: [record('r1', 10)] });
    const r = mergeWorkshop(d);
    expect(names(r)).toEqual([OFFCUTS_FILE, RECORDS_FILE, SETTINGS_FILE].sort());
    expect(r.offcutUpserts).toEqual([]);
    expect(r.newRecords).toEqual([]);
    expect(mergeWorkshop(applied(d, r)).writes).toEqual([]);
  });

  it('brings in what another device kept and keeps the newer copy of each offcut', () => {
    const a = offcut(1, 'a', 10);
    const b = offcut(2, 'b', 20);
    const folder = mergeWorkshop(
      device({ offcuts: [{ ...a, location: 'Rack B', updatedAt: 30 }, b] }),
    );
    const here = device({
      files: folder.writes,
      offcuts: [a],
      settings: { ...DEFAULT_SETTINGS, nextOffcutNumber: 2 },
    });
    const r = mergeWorkshop(here);
    expect(r.offcutUpserts.map((o) => [o.id, o.location])).toEqual([
      ['a', 'Rack B'],
      ['b', ''],
    ]);
    expect(r.offcutRemoves).toEqual([]);
    expect(r.settings?.nextOffcutNumber).toBe(3);
  });

  it('never deletes an offcut just because the folder lacks it', () => {
    const r = mergeWorkshop(
      device({ offcuts: [offcut(1, 'a', 10)], files: mergeWorkshop(device()).writes }),
    );
    expect(r.offcutRemoves).toEqual([]);
    expect(names(r)).toContain(OFFCUTS_FILE);
  });

  it('passes a deletion on, unless the offcut changed again afterwards', () => {
    const a = offcut(1, 'a', 10);
    const b = offcut(2, 'b', 10);
    const deleting = device({ offcuts: [b], offcutDeletions: { a: 50 } });
    const folder = mergeWorkshop({
      ...deleting,
      files: mergeWorkshop(device({ offcuts: [a, b] })).writes,
    });
    const files = after(mergeWorkshop(device({ offcuts: [a, b] })).writes, folder);

    expect(mergeWorkshop(device({ files, offcuts: [a, b] })).offcutRemoves).toEqual(['a']);
    const changedLater = { ...a, location: 'Bin 1', updatedAt: 60 };
    const r = mergeWorkshop(device({ files, offcuts: [changedLater, b] }));
    expect(r.offcutRemoves).toEqual([]);
    expect(names(r)).toContain(OFFCUTS_FILE);
  });

  it('gives a new number to an offcut two devices numbered the same', () => {
    const mine = offcut(5, 'mine', 100, { label: 'printed' });
    const theirs = offcut(5, 'theirs', 200, { label: 'printed' });
    const folder = mergeWorkshop(
      device({ offcuts: [theirs], settings: { ...DEFAULT_SETTINGS, nextOffcutNumber: 6 } }),
    );
    const here = device({
      files: folder.writes,
      offcuts: [mine],
      settings: { ...DEFAULT_SETTINGS, nextOffcutNumber: 6 },
    });
    const r = mergeWorkshop(here);
    // The one kept first keeps OC-0005; the other becomes OC-0006 with a new label queued.
    expect(codes(applied(here, r).offcuts)).toEqual(['mine:OC-0005', 'theirs:OC-0006']);
    expect(r.offcutUpserts.find((o) => o.id === 'theirs')?.label).toBe('queued');
    expect(r.settings?.nextOffcutNumber).toBe(7);

    // The other device agrees on its next sync.
    const there = device({
      files: after(folder.writes, r),
      offcuts: [theirs],
      settings: { ...DEFAULT_SETTINGS, nextOffcutNumber: 6 },
    });
    const r2 = mergeWorkshop(there);
    expect(codes(applied(there, r2).offcuts)).toEqual(['mine:OC-0005', 'theirs:OC-0006']);
    expect(r2.writes).toEqual([]);
  });

  it('adds up the cut records of every device', () => {
    const folder = mergeWorkshop(device({ records: [record('r1', 10), record('r2', 20)] }));
    const r = mergeWorkshop(device({ files: folder.writes, records: [record('r3', 15)] }));
    expect(r.newRecords.map((x) => x.id)).toEqual(['r1', 'r2']);
    const file = r.writes.find((w) => w.name === RECORDS_FILE)!;
    expect((JSON.parse(file.text) as { records: CutRecord[] }).records.map((x) => x.id)).toEqual([
      'r1',
      'r3',
      'r2',
    ]);
  });

  it('takes the newer settings, but never lowers the offcut counter', () => {
    const inches: Settings = { ...DEFAULT_SETTINGS, units: 'in', nextOffcutNumber: 4 };
    const folder = mergeWorkshop(device({ settings: inches, settingsAt: 50 }));
    const here = { ...DEFAULT_SETTINGS, currency: 'CZK', nextOffcutNumber: 9 };

    const older = mergeWorkshop(device({ files: folder.writes, settings: here, settingsAt: 20 }));
    expect(older.settings).toMatchObject({ units: 'in', currency: 'EUR', nextOffcutNumber: 9 });
    expect(older.settingsAt).toBe(50);

    const newer = mergeWorkshop(device({ files: folder.writes, settings: here, settingsAt: 80 }));
    expect(newer.settings).toBeNull();
    expect(names(newer)).toContain(SETTINGS_FILE);
  });

  it('leaves a file it can’t read alone', () => {
    const broken = [{ name: OFFCUTS_FILE, text: '{ half a file' }];
    const r = mergeWorkshop(device({ files: broken, offcuts: [offcut(1, 'a', 10)] }));
    expect(r.unreadable).toEqual([OFFCUTS_FILE]);
    expect(names(r)).not.toContain(OFFCUTS_FILE);
    expect(r.offcutRemoves).toEqual([]);
  });
});
