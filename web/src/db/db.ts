// IndexedDB storage (local only). Bump the Dexie version and add an upgrade when the schema changes.
import Dexie, { type EntityTable } from 'dexie';
import { migrate, type Project } from '../model/project';

class CutListDb extends Dexie {
  projects!: EntityTable<Project, 'id'>;

  constructor(name = 'cutlist') {
    super(name);
    this.version(1).stores({ projects: 'id, updatedAt' });
  }
}

export const db = new CutListDb();

export async function loadProjects(): Promise<Project[]> {
  const rows = await db.projects.orderBy('updatedAt').reverse().toArray();
  return rows.map(migrate);
}

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put(project);
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}
