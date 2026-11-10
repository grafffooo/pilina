// Merging this device with a linked folder (usually inside iCloud Drive, Google Drive or
// OneDrive). The folder holds plain files, one per project in the same format as "Save file",
// plus one library file with the materials and edge bands. No database: every sync reads the
// folder, and for each project the newer copy wins (by its last change time).
//
// Safety rules: a missing file never deletes anything on this device (cloud apps hide or
// re-download files at will); a deletion travels as a small "deleted" file instead. Files the
// app doesn't recognise are left alone.
import {
  FILE_FORMAT,
  FILE_VERSION,
  exportProjectFile,
  fileSlug,
  importProjectFile,
  isProjectFile,
  type ProjectFile,
} from '../model/importExport';
import type { EdgeBand, Material } from '../model/library';
import type { Project } from '../model/project';

export const LIBRARY_FILE = 'pilina-library.json';
const LIBRARY_FORMAT = 'cutlist-library';
const DELETED_FORMAT = 'cutlist-deleted';

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  updatedAt: number;
  materials: Material[];
  edgeBands: EdgeBand[];
}

/** Left in place of a deleted project, so other devices delete it too. */
export interface DeletedFile {
  format: typeof DELETED_FORMAT;
  version: 1;
  id: string;
  deletedAt: number;
}

export interface FolderFile {
  name: string;
  text: string;
}

export interface SyncInput {
  files: FolderFile[];
  projects: Project[];
  materials: Material[];
  edgeBands: EdgeBand[];
  /** When this device last changed its materials or edge bands. */
  libraryAt: number;
  /** Projects deleted here since the last sync, with when. */
  deletions: Record<string, number>;
}

export interface SyncResult {
  /** Projects to add or replace here (unchanged ids and change times). */
  upsert: Project[];
  /** Project ids to delete here. */
  remove: string[];
  /** The merged library, or null when this device's copy is already right. */
  library: { materials: Material[]; edgeBands: EdgeBand[] } | null;
  libraryAt: number;
  writes: FolderFile[];
  /** Old file names of renamed projects. */
  removes: string[];
  /** Files that looked like ours but couldn't be read. */
  unreadable: string[];
}

/** Short stable tag for a project id, so file names stay unique when names repeat. */
function tag(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const projectFileName = (p: Pick<Project, 'id' | 'name'>) =>
  `${fileSlug(p.name)}-${tag(p.id)}.pilina.json`;

const ourName = (name: string, id: string) => name.endsWith(`-${tag(id)}.pilina.json`);

const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

function isDeleted(d: unknown): d is DeletedFile {
  return typeof d === 'object' && d !== null && (d as DeletedFile).format === DELETED_FORMAT;
}
function isLibrary(d: unknown): d is LibraryFile {
  return typeof d === 'object' && d !== null && (d as LibraryFile).format === LIBRARY_FORMAT;
}

/** Union by id; where both have an item, the newer side's copy wins. */
function mergeById<T extends { id: string }>(mine: T[], theirs: T[], theirsNewer: boolean): T[] {
  const out = new Map(mine.map((x) => [x.id, x]));
  for (const x of theirs) if (theirsNewer || !out.has(x.id)) out.set(x.id, x);
  return [...out.values()];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function mergeFolder(input: SyncInput): SyncResult {
  const result: SyncResult = {
    upsert: [],
    remove: [],
    library: null,
    libraryAt: input.libraryAt,
    writes: [],
    removes: [],
    unreadable: [],
  };

  // Read the folder: the newest copy of each project, deletions, the library.
  const projectFiles = new Map<string, { name: string; file: ProjectFile }>();
  const deleted = new Map<string, { name: string; file: DeletedFile }>();
  let library: LibraryFile | null = null;
  for (const f of input.files) {
    if (f.name.startsWith('.') || !f.name.endsWith('.json')) continue;
    let data: unknown;
    try {
      data = JSON.parse(f.text);
    } catch {
      if (f.name.endsWith('.pilina.json') || f.name === LIBRARY_FILE)
        result.unreadable.push(f.name);
      continue;
    }
    if (isLibrary(data)) {
      if (!library || data.updatedAt > library.updatedAt) library = data;
    } else if (isDeleted(data)) {
      const had = deleted.get(data.id);
      if (!had || data.deletedAt > had.file.deletedAt)
        deleted.set(data.id, { name: f.name, file: data });
    } else if (isProjectFile(data)) {
      const had = projectFiles.get(data.project.id);
      // Several copies (a cloud app's "conflict" copy, say): the newest counts, the
      // one named by this app is preferred for writing back.
      if (
        !had ||
        data.project.updatedAt > had.file.project.updatedAt ||
        (data.project.updatedAt === had.file.project.updatedAt && ourName(f.name, data.project.id))
      ) {
        projectFiles.set(data.project.id, { name: f.name, file: data });
      }
    }
  }

  // Library first, so projects coming in find their materials.
  let materials = input.materials;
  let edgeBands = input.edgeBands;
  const theirsNewer = !!library && library.updatedAt > input.libraryAt;
  if (library) {
    materials = mergeById(input.materials, library.materials, theirsNewer);
    edgeBands = mergeById(input.edgeBands, library.edgeBands, theirsNewer);
  }

  const local = new Map(input.projects.map((p) => [p.id, p]));
  const fromFile = (file: ProjectFile): Project => {
    const r = importProjectFile(file, materials, edgeBands, new Set());
    materials = [...materials, ...r.newMaterials];
    edgeBands = [...edgeBands, ...r.newEdgeBands];
    // A synced copy keeps everything an import would reset.
    return { ...r.project, cutAt: file.project.cutAt ?? null, summary: file.project.summary };
  };
  const write = (p: Project, oldName?: string) => {
    const name = projectFileName(p);
    result.writes.push({ name, text: json(exportProjectFile(p, materials, edgeBands)) });
    if (oldName && oldName !== name && ourName(oldName, p.id)) result.removes.push(oldName);
  };
  const ids = new Set([...local.keys(), ...projectFiles.keys(), ...deleted.keys()]);
  for (const id of Object.keys(input.deletions)) ids.add(id);

  for (const id of ids) {
    const mine = local.get(id);
    const file = projectFiles.get(id);
    const gone = deleted.get(id);
    const deletedHere = input.deletions[id];
    const fileAt = file?.file.project.updatedAt ?? -1;

    if (deletedHere !== undefined && !mine) {
      // Deleted on this device: unless someone changed it later elsewhere, say so in the folder.
      if (fileAt > deletedHere) result.upsert.push(fromFile(file!.file));
      else if (!gone || gone.file.deletedAt < deletedHere) {
        const name = file?.name ?? gone?.name ?? `deleted-${tag(id)}.pilina.json`;
        result.writes.push({
          name,
          text: json({ format: DELETED_FORMAT, version: 1, id, deletedAt: deletedHere }),
        });
      }
      continue;
    }

    if (gone && (!file || gone.file.deletedAt >= fileAt)) {
      // Deleted on another device: delete here too, unless it was changed here afterwards.
      if (mine && mine.updatedAt > gone.file.deletedAt) write(mine, gone.name);
      else if (mine) result.remove.push(id);
      continue;
    }

    if (mine && file) {
      if (fileAt > mine.updatedAt) result.upsert.push(fromFile(file.file));
      else if (mine.updatedAt > fileAt || projectFileName(mine) !== file.name)
        write(mine, file.name);
    } else if (mine) {
      write(mine);
    } else if (file) {
      result.upsert.push(fromFile(file.file));
    }
  }

  // The library: write it when the folder lacks something this device has (or is older).
  const merged: LibraryFile = {
    format: LIBRARY_FORMAT,
    version: 1,
    updatedAt: Math.max(input.libraryAt, library?.updatedAt ?? 0),
    materials,
    edgeBands,
  };
  if (!same(materials, input.materials) || !same(edgeBands, input.edgeBands)) {
    result.library = { materials, edgeBands };
  }
  result.libraryAt = merged.updatedAt;
  if (
    !library ||
    !same(library.materials, materials) ||
    !same(library.edgeBands, edgeBands) ||
    library.updatedAt !== merged.updatedAt
  ) {
    result.writes.push({ name: LIBRARY_FILE, text: json(merged) });
  }
  return result;
}

// Re-exported for the folder code and tests.
export { FILE_FORMAT, FILE_VERSION };
