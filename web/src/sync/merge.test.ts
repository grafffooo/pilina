import { describe, expect, it } from 'vitest';
import { exportProjectFile } from '../model/importExport';
import { newMaterial } from '../model/library';
import { emptyPart, newProject, type Project } from '../model/project';
import {
  LIBRARY_FILE,
  mergeFolder,
  projectFileName,
  type FolderFile,
  type SyncInput,
} from './merge';

const oak = { ...newMaterial('Oak 18mm'), id: 'oak' };

function project(name: string, updatedAt: number, id = name): Project {
  const p = newProject(name, updatedAt, oak.id);
  p.id = id;
  p.parts = [{ ...emptyPart(), length: 600, width: 300, qty: 2, label: name }];
  return p;
}

const fileOf = (p: Project, name = projectFileName(p)): FolderFile => ({
  name,
  text: JSON.stringify(exportProjectFile(p, [oak], [])),
});

const input = (over: Partial<SyncInput>): SyncInput => ({
  files: [],
  projects: [],
  materials: [oak],
  edgeBands: [],
  libraryAt: 0,
  deletions: {},
  ...over,
});

const written = (r: ReturnType<typeof mergeFolder>) =>
  r.writes.map((w) => w.name).filter((n) => n !== LIBRARY_FILE);

describe('syncing with a folder', () => {
  it('writes every project and the library to an empty folder', () => {
    const a = project('Stôl', 10);
    const r = mergeFolder(input({ projects: [a] }));
    expect(written(r)).toEqual([projectFileName(a)]);
    expect(r.writes.some((w) => w.name === LIBRARY_FILE)).toBe(true);
    expect(r.upsert).toEqual([]);
  });

  it('takes the newer copy of each project', () => {
    const mine = project('Stôl', 10);
    const theirs = { ...project('Stôl', 20), parts: [] };
    const r = mergeFolder(input({ projects: [mine], files: [fileOf(theirs)] }));
    expect(r.upsert.map((p) => [p.id, p.updatedAt])).toEqual([['Stôl', 20]]);
    expect(written(r)).toEqual([]);

    const r2 = mergeFolder(input({ projects: [project('Stôl', 30)], files: [fileOf(theirs)] }));
    expect(r2.upsert).toEqual([]);
    expect(written(r2)).toEqual([projectFileName(mine)]);
  });

  it('brings in projects made on another device, keeping their cut status', () => {
    const other = { ...project('Skriňa', 5), cutAt: 7 };
    const r = mergeFolder(input({ files: [fileOf(other)] }));
    expect(r.upsert.map((p) => [p.id, p.cutAt])).toEqual([['Skriňa', 7]]);
    expect(r.upsert[0]!.stock[0]!.materialId).toBe('oak');
  });

  it('does nothing when both sides match', () => {
    const a = project('Stôl', 10);
    const first = mergeFolder(input({ projects: [a] }));
    const again = mergeFolder(
      input({ projects: [a], files: first.writes, libraryAt: first.libraryAt }),
    );
    expect(again.writes).toEqual([]);
    expect(again.upsert).toEqual([]);
    expect(again.library).toBeNull();
  });

  it('never deletes because a file is missing', () => {
    const a = project('Stôl', 10);
    const r = mergeFolder(input({ projects: [a], files: [] }));
    expect(r.remove).toEqual([]);
    expect(written(r)).toEqual([projectFileName(a)]);
  });

  it('passes deletions on through a marker file', () => {
    const a = project('Stôl', 10);
    const here = mergeFolder(input({ files: [fileOf(a)], deletions: { [a.id]: 50 } }));
    expect(here.writes.map((w) => [w.name, JSON.parse(w.text).format])).toContainEqual([
      projectFileName(a),
      'cutlist-deleted',
    ]);
    // The other device still has it, unchanged since: it goes there too.
    const there = mergeFolder(input({ projects: [a], files: here.writes }));
    expect(there.remove).toEqual([a.id]);
    // Changed there after the deletion: it survives and comes back.
    const edited = mergeFolder(input({ projects: [project('Stôl', 60)], files: here.writes }));
    expect(edited.remove).toEqual([]);
    expect(written(edited)).toEqual([projectFileName(a)]);
  });

  it('renames the file with the project', () => {
    const a = project('Stôl', 10);
    const renamed = { ...a, name: 'Jedálenský stôl', updatedAt: 20 };
    const r = mergeFolder(input({ projects: [renamed], files: [fileOf(a)] }));
    expect(written(r)).toEqual([projectFileName(renamed)]);
    expect(r.removes).toEqual([projectFileName(a)]);
  });

  it('leaves other files alone and reports damaged ones', () => {
    const r = mergeFolder(
      input({
        files: [
          { name: 'notes.txt', text: 'hello' },
          { name: '.stol.pilina.json.icloud', text: '' },
          { name: 'broken.pilina.json', text: '{"format":' },
        ],
      }),
    );
    expect(r.unreadable).toEqual(['broken.pilina.json']);
    expect(r.removes).toEqual([]);
  });

  it('merges materials from both sides, the newer library winning a clash', () => {
    const walnut = { ...newMaterial('Walnut'), id: 'walnut' };
    const oakPriced = { ...oak, price: 99 };
    const library = {
      name: LIBRARY_FILE,
      text: JSON.stringify({
        format: 'cutlist-library',
        version: 1,
        updatedAt: 100,
        materials: [oakPriced, walnut],
        edgeBands: [],
      }),
    };
    const older = mergeFolder(input({ files: [library], libraryAt: 50 }));
    expect(older.library!.materials.map((m) => [m.id, m.price])).toEqual([
      ['oak', 99],
      ['walnut', null],
    ]);
    const newer = mergeFolder(input({ files: [library], libraryAt: 200 }));
    expect(newer.library!.materials.map((m) => [m.id, m.price])).toEqual([
      ['oak', oak.price],
      ['walnut', null],
    ]);
    expect(newer.writes.map((w) => w.name)).toEqual([LIBRARY_FILE]);
  });
});
