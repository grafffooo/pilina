// The workshop's own data in the linked folder, beside the projects (see merge.ts): the offcut
// library, the cut records behind the statistics, and the workshop settings. Same rules as
// projects: plain files, newer copy wins, a missing file or entry never deletes anything here,
// and a deleted offcut leaves a marker so other devices delete it too.
import type { CutRecord } from '../model/cutRecord';
import type { Settings } from '../model/library';
import { offcutCode, type Offcut } from '../model/offcut';
import type { FolderFile } from './merge';

export const SETTINGS_FILE = 'pilina-settings.json';
export const OFFCUTS_FILE = 'pilina-offcuts.json';
export const RECORDS_FILE = 'pilina-cut-records.json';

interface SettingsFile {
  format: 'cutlist-settings';
  version: 1;
  updatedAt: number;
  settings: Partial<Settings>;
}

interface OffcutsFile {
  format: 'cutlist-offcuts';
  version: 1;
  offcuts: Offcut[];
  /** Deleted offcut ids, with when. */
  deleted: Record<string, number>;
}

interface RecordsFile {
  format: 'cutlist-cut-records';
  version: 1;
  records: CutRecord[];
}

export interface WorkshopInput {
  files: FolderFile[];
  settings: Settings;
  /** When the settings last changed here (not counting the offcut counter). */
  settingsAt: number;
  offcuts: Offcut[];
  /** Offcuts deleted here since the last sync, with when. */
  offcutDeletions: Record<string, number>;
  records: CutRecord[];
}

export interface WorkshopResult {
  /** New settings for this device, or null when they stay. */
  settings: Settings | null;
  settingsAt: number;
  /** Offcuts to add or replace here, and ids to delete. */
  offcutUpserts: Offcut[];
  offcutRemoves: string[];
  /** Cut records this device doesn't have yet. */
  newRecords: CutRecord[];
  writes: FolderFile[];
  unreadable: string[];
}

/** When an offcut last changed; older offcuts only know when they were kept. */
export const offcutAt = (o: Offcut) => o.updatedAt ?? o.createdAt;

const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function read<T extends { format: string }>(
  files: FolderFile[],
  name: string,
  format: T['format'],
  unreadable: string[],
): T | null {
  const f = files.find((x) => x.name === name);
  if (!f) return null;
  try {
    const data = JSON.parse(f.text) as T;
    if (data?.format === format) return data;
  } catch {
    // Falls through: reported, and left alone until it can be read.
  }
  unreadable.push(name);
  return null;
}

const codeNumber = (code: string) => {
  const m = /^OC-(\d+)$/.exec(code);
  return m ? Number(m[1]) : 0;
};

export function mergeWorkshop(input: WorkshopInput): WorkshopResult {
  const unreadable: string[] = [];
  const result: WorkshopResult = {
    settings: null,
    settingsAt: input.settingsAt,
    offcutUpserts: [],
    offcutRemoves: [],
    newRecords: [],
    writes: [],
    unreadable,
  };
  const settingsFile = read<SettingsFile>(
    input.files,
    SETTINGS_FILE,
    'cutlist-settings',
    unreadable,
  );
  const offcutsFile = read<OffcutsFile>(input.files, OFFCUTS_FILE, 'cutlist-offcuts', unreadable);
  const recordsFile = read<RecordsFile>(
    input.files,
    RECORDS_FILE,
    'cutlist-cut-records',
    unreadable,
  );
  const skip = (name: string) => unreadable.includes(name);

  // ---- Offcuts: the newer copy of each, unless it was deleted after its last change. ----
  const deleted: Record<string, number> = { ...(offcutsFile?.deleted ?? {}) };
  for (const [id, at] of Object.entries(input.offcutDeletions))
    deleted[id] = Math.max(deleted[id] ?? 0, at);
  const byId = new Map<string, Offcut>();
  for (const o of [...input.offcuts, ...(offcutsFile?.offcuts ?? [])]) {
    const had = byId.get(o.id);
    if (!had || offcutAt(o) > offcutAt(had)) byId.set(o.id, o);
  }
  for (const [id, o] of byId) {
    if (deleted[id] === undefined) continue;
    if (deleted[id] >= offcutAt(o)) byId.delete(id);
    else delete deleted[id]; // Changed again after it was deleted elsewhere: it stays.
  }

  // Two devices may each have kept an offcut as OC-0012 before syncing. The one kept first
  // keeps the code; the other gets the next free number and a new label in the queue.
  const merged = [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  let next = Math.max(
    input.settings.nextOffcutNumber,
    ...merged.map((o) => codeNumber(o.code) + 1),
  );
  const codes = new Set<string>();
  const offcuts = merged.map((o) => {
    if (!codes.has(o.code)) {
      codes.add(o.code);
      return o;
    }
    const code = offcutCode(next++);
    codes.add(code);
    return { ...o, code, label: 'queued' as const, updatedAt: offcutAt(o) + 1 };
  });

  const local = new Map(input.offcuts.map((o) => [o.id, o]));
  result.offcutUpserts = offcuts.filter((o) => !same(local.get(o.id), o));
  const kept = new Set(offcuts.map((o) => o.id));
  result.offcutRemoves = input.offcuts.filter((o) => !kept.has(o.id)).map((o) => o.id);
  const offcutsOut: OffcutsFile = { format: 'cutlist-offcuts', version: 1, offcuts, deleted };
  if (
    !skip(OFFCUTS_FILE) &&
    (!offcutsFile ||
      !same(
        [...offcutsFile.offcuts].sort((a, b) => a.id.localeCompare(b.id)),
        [...offcuts].sort((a, b) => a.id.localeCompare(b.id)),
      ) ||
      !same(offcutsFile.deleted, deleted))
  ) {
    result.writes.push({ name: OFFCUTS_FILE, text: json(offcutsOut) });
  }

  // ---- Cut records: only ever added, so the union. ----
  const theirs = recordsFile?.records ?? [];
  const mine = new Set(input.records.map((r) => r.id));
  const inFile = new Set(theirs.map((r) => r.id));
  result.newRecords = theirs.filter((r) => !mine.has(r.id));
  if (!skip(RECORDS_FILE) && (!recordsFile || input.records.some((r) => !inFile.has(r.id)))) {
    const records = [...theirs, ...input.records.filter((r) => !inFile.has(r.id))].sort(
      (a, b) => a.at - b.at,
    );
    result.writes.push({
      name: RECORDS_FILE,
      text: json({ format: 'cutlist-cut-records', version: 1, records }),
    });
  }

  // ---- Settings: the newer side's, but the offcut counter only ever goes up. ----
  let settings = input.settings;
  // A tie goes to the folder, so two devices that never changed anything agree.
  if (settingsFile && settingsFile.updatedAt >= input.settingsAt) {
    settings = { ...input.settings, ...settingsFile.settings };
    result.settingsAt = settingsFile.updatedAt;
  }
  settings = {
    ...settings,
    nextOffcutNumber: Math.max(
      next,
      settings.nextOffcutNumber,
      settingsFile?.settings.nextOffcutNumber ?? 0,
    ),
  };
  if (!same(settings, input.settings)) result.settings = settings;
  const settingsOut: SettingsFile = {
    format: 'cutlist-settings',
    version: 1,
    updatedAt: result.settingsAt,
    settings,
  };
  if (!skip(SETTINGS_FILE) && (!settingsFile || !same(settingsFile, settingsOut)))
    result.writes.push({ name: SETTINGS_FILE, text: json(settingsOut) });

  return result;
}
