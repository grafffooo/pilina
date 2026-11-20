import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { emptyLinearPart, emptyLinearStock, emptyPart } from '../model/project';
import {
  addLinearMaterial,
  addLinearStock,
  addMaterial,
  insertLinearParts,
  insertParts,
  removeLinearStock,
  updateLinearPart,
  updatePart,
  useStore,
} from './store';

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

  it('manages linear materials, parts, stock, offcuts, and resets linear state on project switch', () => {
    const s = useStore.getState();
    const kvh = addLinearMaterial('KVH 45x95', { stockLength: 4000 });
    expect(kvh).toMatchObject({
      kind: 'linear',
      thickness: 45,
      profileWidth: 95,
      stockLength: 4000,
    });

    const firstRowId = current().linearParts[0]!.id;
    updateLinearPart(firstRowId, { length: 1200, qty: 2, materialId: kvh.id });
    insertLinearParts([{ ...emptyLinearPart(), length: 800, label: 'Rail' }], firstRowId);
    const bar = { ...emptyLinearStock(), length: 4000, materialId: kvh.id };
    addLinearStock(bar);
    expect(current().linearParts).toHaveLength(2);
    expect(current().linearStock).toHaveLength(1);
    removeLinearStock(bar.id);
    expect(current().linearStock).toHaveLength(0);

    const [created] = s.addOffcuts([{ kind: 'linear', length: 1200, materialId: kvh.id }]);
    expect(created).toMatchObject({ kind: 'linear', length: 1200, width: 0, materialId: kvh.id });

    s.setLinearResult({ status: 'ready', error: null });
    s.setLinearCost({ materials: [], extras: 0, total: 16, complete: true });
    expect(useStore.getState().linearResult.status).toBe('ready');
    expect(useStore.getState().linearCost?.total).toBe(16);

    // Ensure createProject() picks a sheet material, never a linear material, when starting fresh.
    const sheetMat = addMaterial('Oak 18mm');
    useStore.getState().editLibrary((lib) => ({
      ...lib,
      materials: [kvh, sheetMat],
    }));
    useStore.getState().edit((p) => ({ ...p, stock: [] }));
    s.createProject();
    expect(current().stock[0]!.materialId).toBe(sheetMat.id);
    expect(useStore.getState().linearResult.status).toBe('empty');
    expect(useStore.getState().linearCost).toBeNull();
  });
});
