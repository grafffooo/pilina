// IndexedDB storage (local only). Bump the Dexie version and add an upgrade when the schema changes.
import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_SETTINGS, type EdgeBand, type Material, type Settings } from '../model/library';
import type { CutRecord } from '../model/cutRecord';
import type { Offcut } from '../model/offcut';
import type { Project } from '../model/project';

interface SettingsRow extends Settings {
  key: 'app';
}

class CutListDb extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  materials!: EntityTable<Material, 'id'>;
  edgeBands!: EntityTable<EdgeBand, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  offcuts!: EntityTable<Offcut, 'id'>;
  cutRecords!: EntityTable<CutRecord, 'id'>;

  constructor(name = 'cutlist') {
    super(name);
    this.version(1).stores({ projects: 'id, updatedAt' });
    // v2: material and edge-band library, app settings.
    this.version(2).stores({ materials: 'id', edgeBands: 'id', settings: 'key' });
    // v3: offcut library and cut history.
    this.version(3).stores({ offcuts: 'id, code, status', cutRecords: 'id, at, projectId' });
  }
}

export const db = new CutListDb();

/** Raw records: the store migrates them (see `migrate` and `linkLegacyStockLabels`). */
export async function loadRawProjects(): Promise<(Partial<Project> & { id: string })[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put(project);
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}

export async function loadLibrary(): Promise<{
  materials: Material[];
  edgeBands: EdgeBand[];
  settings: Settings;
}> {
  const [materials, edgeBands, row] = await Promise.all([
    db.materials.toArray(),
    db.edgeBands.toArray(),
    db.settings.get('app'),
  ]);
  const { key: _key, ...stored } = row ?? { key: 'app' };
  return { materials, edgeBands, settings: { ...DEFAULT_SETTINGS, ...stored } };
}

export async function saveLibrary(
  materials: Material[],
  edgeBands: EdgeBand[],
  settings: Settings,
): Promise<void> {
  await db.transaction('rw', db.materials, db.edgeBands, db.settings, async () => {
    // Small tables: replace them whole, so deletions are saved too.
    await db.materials.clear();
    await db.materials.bulkPut(materials);
    await db.edgeBands.clear();
    await db.edgeBands.bulkPut(edgeBands);
    await db.settings.put({ ...settings, key: 'app' });
  });
}

export async function loadOffcuts(): Promise<Offcut[]> {
  return db.offcuts.toArray();
}

export async function saveOffcuts(changed: Offcut[], removedIds: string[]): Promise<void> {
  await db.transaction('rw', db.offcuts, async () => {
    if (changed.length) await db.offcuts.bulkPut(changed);
    if (removedIds.length) await db.offcuts.bulkDelete(removedIds);
  });
}

export async function addCutRecord(record: CutRecord): Promise<void> {
  await db.cutRecords.put(record);
}
