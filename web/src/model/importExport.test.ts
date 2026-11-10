import { describe, expect, it } from 'vitest';
import {
  convertOldProjects,
  exportProjectFile,
  fileSlug,
  importProjectFile,
  isProjectFile,
  parseOldMarkdown,
  parseOldStorage,
} from './importExport';
import { newEdgeBand, newMaterial } from './library';
import { emptyPart, newProject } from './project';

// Exactly what the old app's projectToMarkdown() writes.
const OLD_MD = `---
title: Skrinky do dielne
id: proj_skrinky_dielna
updated: 2026-10-22T11:33:00
kerf: 4
trim: 0
units: mm
---

# Skrinky do dielne

## Settings
- **Saw Thickness / Kerf**: 4 mm
- **Trim / Margin**: 0 mm
- **Units**: mm

## Parts
| # | Length | Width | Qty | Label | Grain | Enabled | EdgeTop | EdgeBottom | EdgeLeft | EdgeRight |
|---|--------|-------|-----|-------|-------|---------|---------|------------|----------|-----------|
| 1 | 1000 | 300 | 2 | Sides | none | true | true | true | true | true |
| 2 | 764 | 300 | 10 | Shelves and T/B | none | true | true | true | true | true |
| 3 | 764 | 80 | 2 | Stretchers | length | false | true | false | false | false |

## Stock Panels
| # | Length | Width | Qty | Label | Priority | Enabled |
|---|--------|-------|-----|-------|----------|---------|
| 1 | 2800 | 2070 | 999 | DTD Black 18mm | true | true |
| 2 | 1250 | 1000 | 3 | DTD Black 18mm | false | true |
`;

describe('old app import', () => {
  it('reads the old Markdown export', () => {
    const old = parseOldMarkdown(OLD_MD, 'whatever.md');
    expect(old.title).toBe('Skrinky do dielne');
    expect(old.id).toBe('proj_skrinky_dielna');
    expect(old.settings).toMatchObject({ kerf: 4, trim: 0 });
    expect(old.parts).toHaveLength(3);
    expect(old.stock).toHaveLength(2);
  });

  it('converts to projects with materials, unlimited stock and edges', () => {
    const existing = newMaterial('dtd black 18MM');
    const { projects, newMaterials } = convertOldProjects([parseOldMarkdown(OLD_MD)], [existing]);
    const p = projects[0]!;
    expect(newMaterials).toHaveLength(0); // matched the existing material by name
    expect(p.id).toBe('old-proj_skrinky_dielna');
    expect(p.name).toBe('Skrinky do dielne');
    expect(p.parts.map((x) => [x.length, x.width, x.qty, x.label, x.grain, x.enabled])).toEqual([
      [1000, 300, 2, 'Sides', 'none', true],
      [764, 300, 10, 'Shelves and T/B', 'none', true],
      [764, 80, 2, 'Stretchers', 'length', false],
    ]);
    expect(p.parts[2]!.edges).toEqual({ top: true, bottom: false, left: false, right: false });
    expect(p.stock.map((s) => [s.qty, s.priority, s.materialId])).toEqual([
      [null, true, existing.id],
      [3, false, existing.id],
    ]);
    expect(p.updatedAt).toBe(Date.parse('2026-10-22T11:33:00'));
  });

  it('reads the old browser storage', () => {
    const json = JSON.stringify([
      {
        id: 'proj_plexisklo',
        title: 'plexisklo',
        settings: { kerf: 3 },
        parts: [
          {
            length: 600,
            width: 400,
            qty: 4,
            label: 'Door Covers',
            edges: { top: false, bottom: false, left: false, right: false },
          },
        ],
        stock: [{ length: 1500, width: 1000, qty: 2, label: 'Plexi 3mm', priority: true }],
      },
      { junk: true },
    ]);
    const { projects, newMaterials } = convertOldProjects(parseOldStorage(json), []);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.kerf).toBe(3);
    expect(projects[0]!.parts[0]!.edges.top).toBe(false);
    expect(newMaterials.map((m) => [m.name, m.thickness])).toEqual([['Plexi 3mm', 3]]);
    expect(() => parseOldStorage('{"a":1}')).toThrow();
  });

  it('converts projects the old app measured in inches', () => {
    const json = JSON.stringify([
      {
        title: 'Bookcase',
        settings: { kerf: 0.125, trim: 0.5, units: 'in' },
        parts: [{ length: 30, width: 11.25, qty: 2, label: 'Shelf' }],
        stock: [{ length: 96, width: 48, qty: 1, label: 'Ply' }],
      },
    ]);
    const { projects, units } = convertOldProjects(parseOldStorage(json), []);
    const p = projects[0]!;
    expect(units).toBe('in');
    expect(p.kerf).toBeCloseTo(3.175);
    expect(p.trim).toBeCloseTo(12.7);
    expect(p.parts[0]!.length).toBeCloseTo(762);
    expect(p.parts[0]!.width).toBeCloseTo(285.75);
    expect(p.stock[0]!.length).toBeCloseTo(2438.4);
  });
});

describe('project files', () => {
  it('round-trips a project with its materials and bands', () => {
    const board = { ...newMaterial('Oak 19mm'), price: 120 };
    const band = { ...newEdgeBand('Oak veneer'), pricePerMetre: 2 };
    const unrelated = newMaterial('Unused');
    const p = newProject('Stôl', 0, board.id);
    p.defaultEdgeBandId = band.id;
    p.parts = [{ ...emptyPart(), length: 900, width: 600, qty: 1 }];
    const file = JSON.parse(JSON.stringify(exportProjectFile(p, [board, unrelated], [band])));
    expect(isProjectFile(file)).toBe(true);
    expect(file.materials.map((m: { name: string }) => m.name)).toEqual(['Oak 19mm']);

    // On another device: nothing known yet, so the material and band are added.
    const fresh = importProjectFile(file, [], [], new Set());
    expect(fresh.newMaterials).toHaveLength(1);
    expect(fresh.newEdgeBands).toHaveLength(1);
    expect(fresh.project.stock[0]!.materialId).toBe(board.id);

    // Here again: the project id is taken, the material exists under another id but the same name.
    const local = { ...board, id: 'local-oak' };
    const again = importProjectFile(file, [local], [band], new Set([p.id]));
    expect(again.project.id).not.toBe(p.id);
    expect(again.newMaterials).toHaveLength(0);
    expect(again.project.stock[0]!.materialId).toBe('local-oak');
    expect(again.project.defaultEdgeBandId).toBe(band.id);
  });

  it('makes file names', () => {
    expect(fileSlug('Stôl – jedáleň')).toBe('stol-jedalen');
  });
});
