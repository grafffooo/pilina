import { describe, expect, it } from 'vitest';
import { exportProjectFile } from './importExport';
import { newLinearMaterial, newMaterial } from './library';
import { emptyLinearPart, emptyLinearStock, emptyPart, newProject } from './project';
import { isLocalAddress, projectLink, QR_MAX, readProjectLink } from './shareLink';

describe('project links', () => {
  it('carries a project in the hash and reads it back', async () => {
    const board = newMaterial('Dub 18mm');
    const p = newProject('Polička – Žilina', 0, board.id);
    p.parts = [{ ...emptyPart(), length: 900, width: 250, qty: 4, label: 'Polica' }];
    p.summary = { pieces: 4, sheets: 1, usedPct: 20 };
    const link = await projectLink(exportProjectFile(p, [board], []), 'https://pilina.app/#old');
    expect(link.startsWith('https://pilina.app/#import=')).toBe(true);
    expect(link.length).toBeLessThan(QR_MAX);
    const file = (await readProjectLink(new URL(link).hash))!;
    expect(file.project.name).toBe('Polička – Žilina');
    expect(file.project.parts[0]).toMatchObject({ length: 900, label: 'Polica' });
    expect(file.project.summary).toBeNull();
    expect(file.materials.map((m) => m.name)).toEqual(['Dub 18mm']);
    // Fresh ids on arrival, still pointing at each other.
    expect(file.materials[0]!.id).toHaveLength(36);
    expect(file.project.stock[0]!.materialId).toBe(file.materials[0]!.id);
  });

  it('ignores other hashes and rejects damaged links', async () => {
    expect(await readProjectLink('#settings')).toBeNull();
    await expect(readProjectLink('#import=AAAA')).rejects.toThrow();
  });

  it('knows addresses that only work on this computer', () => {
    expect(isLocalAddress('http://localhost:5173/#import=x')).toBe(true);
    expect(isLocalAddress('https://pilina.app/#import=x')).toBe(false);
  });

  it('remaps linear parts, linear stock, and linear material ids through a link', async () => {
    const board = newMaterial('Dub 18mm');
    const kvh = { ...newLinearMaterial('KVH 45x95'), stockLength: 4000 };
    const p = newProject('Polica a rám', 0, board.id);
    p.parts = [{ ...emptyPart(), length: 800, width: 250, qty: 2, label: 'Polica' }];
    p.linearParts = [
      { ...emptyLinearPart(), id: 'lp1', length: 1200, qty: 2, label: 'Noha', materialId: kvh.id },
    ];
    p.linearStock = [{ ...emptyLinearStock(), id: 'ls1', length: 4000, materialId: kvh.id }];

    const link = await projectLink(exportProjectFile(p, [board, kvh], []), 'https://pilina.app/');
    const file = (await readProjectLink(new URL(link).hash))!;
    const arrivedKvh = file.materials.find((m) => m.name === 'KVH 45x95')!;
    expect(arrivedKvh.id).toHaveLength(36);
    expect(arrivedKvh.id).not.toBe(kvh.id);
    expect(file.project.linearParts[0]!.id).not.toBe('lp1');
    expect(file.project.linearStock[0]!.id).not.toBe('ls1');
    expect(file.project.linearParts[0]!.materialId).toBe(arrivedKvh.id);
    expect(file.project.linearStock[0]!.materialId).toBe(arrivedKvh.id);
  });
});
