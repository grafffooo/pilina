import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { emptyPart } from '../model/project';
import { insertParts, updatePart, useStore } from './store';

const current = () => {
  const s = useStore.getState();
  return s.projects.find((p) => p.id === s.currentId)!;
};

const settle = () => new Promise((r) => setTimeout(r, 600));

describe('store', () => {
  it('creates exactly one first project even when init runs twice', async () => {
    const s = useStore.getState();
    await Promise.all([s.init(), s.init()]);
    expect(useStore.getState().projects).toHaveLength(1);
    expect(await db.projects.count()).toBe(1);
  });

  it('merges typing into one undo step and undoes it', () => {
    const id = current().parts[0]!.id;
    updatePart(id, { length: 1 }, `${id}.length`);
    updatePart(id, { length: 10 }, `${id}.length`);
    updatePart(id, { length: 100 }, `${id}.length`);
    expect(useStore.getState().history.past).toHaveLength(1);
    useStore.getState().undo();
    expect(current().parts[0]!.length).toBeNull();
    useStore.getState().redo();
    expect(current().parts[0]!.length).toBe(100);
  });

  it('saves edits to IndexedDB after a short delay', async () => {
    insertParts([{ ...emptyPart(), length: 500, width: 300, label: 'Saved' }]);
    await settle();
    const stored = await db.projects.get(current().id);
    expect(stored?.parts.some((p) => p.label === 'Saved')).toBe(true);
    expect(useStore.getState().saveState).toBe('saved');
  });

  it('never leaves the app without a project', async () => {
    await useStore.getState().deleteProject(current().id);
    expect(useStore.getState().projects).toHaveLength(1);
    expect(useStore.getState().currentId).toBe(useStore.getState().projects[0]!.id);
  });
});
