import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { CostBreakdown, Job, Plan } from '../engine/types';
import { emptyPart, newProject } from '../model/project';
import { buildPdf } from './buildPdf';
import { pdfFileName } from './exportPdf';

const font = (w: string) =>
  readFileSync(new URL(`../../node_modules/@expo-google-fonts/inter/${w}.ttf`, import.meta.url));

/** A small hand-made plan with Slovak/Czech labels (the engine isn't needed here). */
function sample() {
  const project = newProject('Kuchynská linka – Žilina');
  project.parts = [
    {
      ...emptyPart(),
      id: 'a',
      length: 1000,
      width: 300,
      qty: 2,
      label: 'Bočnica ľavá/pravá',
      edges: { top: true, bottom: true, left: false, right: false },
    },
    { ...emptyPart(), id: 'b', length: 764, width: 300, qty: 1, label: 'Polička – dvířka řez' },
  ];
  project.pricing.extras = [{ id: 'x', label: 'Pánty', amount: 1.2, qty: 8 }];
  const job: Job = {
    kerf: 4,
    parts: [
      { id: 'a', length: 1000, width: 300, qty: 2, label: 'Bočnica ľavá/pravá' },
      { id: 'b', length: 764, width: 300, qty: 1, label: 'Polička – dvířka řez' },
    ],
    stock: [{ id: 's', length: 2800, width: 2070, label: 'DTD Čierna 18mm' }],
  };
  const plan: Plan = {
    sheets: [
      {
        stockId: 's',
        width: 2070,
        length: 2800,
        qty: 1,
        placements: [
          { partId: 'a', instance: 0, rect: { x: 0, y: 0, w: 300, h: 1000 }, rotated: false },
          { partId: 'a', instance: 1, rect: { x: 0, y: 1004, w: 300, h: 1000 }, rotated: false },
          { partId: 'b', instance: 0, rect: { x: 304, y: 0, w: 764, h: 300 }, rotated: true },
        ],
        cuts: [
          {
            number: 1,
            stage: 1,
            axis: 'x',
            pos: 302,
            x1: 302,
            y1: 0,
            x2: 302,
            y2: 2800,
            length: 2800,
          },
          {
            number: 2,
            stage: 2,
            axis: 'y',
            pos: 1002,
            x1: 0,
            y1: 1002,
            x2: 302,
            y2: 1002,
            length: 302,
          },
        ],
        waste: [{ x: 1072, y: 0, w: 998, h: 2800 }],
      },
    ],
    unplaced: [{ partId: 'b', count: 0 }].filter((u) => u.count > 0),
    totals: {
      sheets: 1,
      offcutsUsed: 0,
      sheetArea: 5_796_000,
      usedArea: 829_200,
      wasteArea: 4_966_800,
      cuts: 2,
      cutLength: 3102,
      edgeBandLength: 4000,
    },
  };
  const cost: CostBreakdown = {
    materials: [
      {
        material: 'DTD Čierna 18mm',
        sheets: 1,
        sheetArea: 5_796_000,
        usedArea: 829_200,
        creditArea: 0,
        gross: 45,
        credit: 0,
        cost: 45,
        priced: true,
      },
    ],
    edgeBands: [{ band: 'ABS 2 mm', length: 4080, cost: 2.45, priced: true }],
    extras: 9.6,
    total: 57.05,
    complete: true,
  };
  return { project, job, plan, cost };
}

describe('buildPdf', () => {
  it('builds a summary page plus one page per sheet, with the fonts embedded', async () => {
    const { project, job, plan, cost } = sample();
    const bytes = await buildPdf(
      { project, job, plan, cost, materials: [], currency: 'EUR', date: new Date(2026, 10, 9) },
      {
        regular: font('400Regular/Inter_400Regular'),
        semibold: font('600SemiBold/Inter_600SemiBold'),
      },
    );
    // Kept for manual inspection when PDF_OUT is set.
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe('Kuchynská linka – Žilina');
    // Two full Inter weights (~340 KB each, compressed in the PDF) plus the drawing.
    expect(bytes.length).toBeLessThan(800_000);
  });
});

it('continues a long parts list on the next page', async () => {
  const { project, job, plan, cost } = sample();
  project.parts = Array.from({ length: 40 }, (_, i) => ({
    ...emptyPart(),
    id: `p${i}`,
    length: 300 + i * 10,
    width: 200,
    qty: 1,
    label: `Diel ${i + 1}`,
    edges: { top: i % 2 === 0, bottom: false, left: i % 3 === 0, right: false },
  }));
  const bytes = await buildPdf(
    { project, job, plan, cost, materials: [], currency: 'EUR', edgeAllowance: 20 },
    {
      regular: font('400Regular/Inter_400Regular'),
      semibold: font('600SemiBold/Inter_600SemiBold'),
    },
  );
  // 40 rows at 38 pt: the summary page, two more pages of parts, then the sheet.
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
});

it('makes a plain file name', () => {
  expect(pdfFileName('Skrinky do dielne')).toBe('skrinky-do-dielne.pdf');
  expect(pdfFileName('Kuchynská linka – Žilina')).toBe('kuchynska-linka-zilina.pdf');
  expect(pdfFileName('  ')).toBe('cutting-plan.pdf');
});
