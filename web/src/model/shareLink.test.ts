import { describe, expect, it } from 'vitest';
import { exportProjectFile } from './importExport';
import { newMaterial } from './library';
import { emptyPart, newProject } from './project';
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
});
