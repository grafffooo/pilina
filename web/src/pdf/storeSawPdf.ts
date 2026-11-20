// Builds a single-purpose "Store Saw Operator" A4 PDF showing only the 1–3 rough
// breakdown cuts needed so sheets and bars fit inside the selected vehicle.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { PreCutBar, PreCutSheet } from '../engine/types';
import { t as tr } from '../i18n';
import { formatLength, formatLengthUnit } from '../lib/units';
import type { TransportProfile } from '../model/library';
import type { Project } from '../model/project';
import type { PdfFonts } from './buildPdf';
import { BOARD, H, INK, INK_2, INK_3, M, RIP, W, rule, text } from './draw';

export interface StoreSawPdfInput {
  project: Project;
  profile: TransportProfile;
  preCuts2d: PreCutSheet[];
  preCuts1d: PreCutBar[];
}

export async function buildStoreSawPdf(
  input: StoreSawPdfInput,
  fonts: PdfFonts,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: false });
  const bold = await doc.embedFont(fonts.semibold, { subset: false });
  doc.setTitle(`${input.project.name || tr('Untitled project')} — ${tr('Store Saw PDF')}`);
  doc.setCreator('Pilina');
  doc.setProducer('Pilina');

  const page = doc.addPage([W, H]);
  let y = H - M;

  // Header
  text(page, bold, tr('Store Saw PDF').toUpperCase(), M, y, 8, INK_3);
  y -= 18;
  text(page, bold, input.project.name || tr('Untitled project'), M, y, 18, INK);
  y -= 18;
  text(
    page,
    regular,
    `${tr('Vehicle')}: ${input.profile.name} (${formatLength(input.profile.maxLength)} × ${formatLengthUnit(input.profile.maxWidth)})`,
    M,
    y,
    10,
    INK_2,
  );
  y -= 12;
  rule(page, M, y, W - M, 0.75);
  y -= 20;

  // 2D Sheet breakdown diagrams
  for (const sheet of input.preCuts2d) {
    if (y < 220) {
      // Simple page break if multiple oversized sheets
      const next = doc.addPage([W, H]);
      y = H - M;
      drawSheetPreCut(next, bold, regular, sheet, y);
      y -= 230;
      continue;
    }
    drawSheetPreCut(page, bold, regular, sheet, y);
    y -= 230;
  }

  // 1D Bar breakdown diagrams
  for (const bar of input.preCuts1d) {
    drawBarPreCut(page, bold, regular, bar, y);
    y -= 86;
  }

  return doc.save();
}

function drawSheetPreCut(
  page: ReturnType<PDFDocument['addPage']>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  regular: Awaited<ReturnType<PDFDocument['embedFont']>>,
  sheet: PreCutSheet,
  topY: number,
) {
  const title = `${sheet.label || tr('Material')} · ${formatLength(sheet.length)} × ${formatLengthUnit(sheet.width)}`;
  text(page, bold, title, M, topY, 11, INK);
  text(
    page,
    regular,
    `${tr('Store saw kerf')}: ${formatLengthUnit(sheet.storeKerf)}`,
    W - M - 140,
    topY,
    9,
    INK_3,
  );

  // Draw sheet diagram on left, cut list on right
  const maxW = 280;
  const maxH = 175;
  const scale = Math.min(maxW / sheet.width, maxH / sheet.length);
  const dw = sheet.width * scale;
  const dh = sheet.length * scale;
  const ox = M;
  const oy = topY - 16 - dh;

  page.drawRectangle({
    x: ox,
    y: oy,
    width: dw,
    height: dh,
    color: BOARD,
    borderColor: INK,
    borderWidth: 1,
  });

  // Resulting pieces labels
  for (const p of sheet.pieces) {
    const px = ox + p.x * scale;
    const py = oy + dh - (p.y + p.length) * scale;
    const pw = p.width * scale;
    const ph = p.length * scale;
    page.drawRectangle({
      x: px,
      y: py,
      width: pw,
      height: ph,
      borderColor: rgb(0.7, 0.65, 0.58),
      borderWidth: 0.5,
    });
    const dim = `${formatLength(p.length)}×${formatLength(p.width)}`;
    if (pw > 38 && ph > 16) {
      text(page, regular, dim, px + 4, py + ph / 2 - 3, 7.5, INK_2);
    }
  }

  // Breakdown cut lines
  for (const c of sheet.cuts) {
    const x1 = ox + c.x1 * scale;
    const y1 = oy + dh - c.y1 * scale;
    const x2 = ox + c.x2 * scale;
    const y2 = oy + dh - c.y2 * scale;
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 1.5,
      color: RIP,
      dashArray: [4, 3],
    });
  }

  // Breakdown cut list on the right
  let cy = topY - 24;
  const lx = M + dw + 24;
  sheet.cuts.forEach((c, i) => {
    const dir = c.axis === 'y' ? tr('Cross cut') : tr('Rip');
    text(
      page,
      bold,
      `${i + 1}. ${dir} @ ${formatLengthUnit(c.pos)}`,
      lx,
      cy,
      9.5,
      INK,
    );
    cy -= 15;
  });
}

function drawBarPreCut(
  page: ReturnType<PDFDocument['addPage']>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  regular: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bar: PreCutBar,
  topY: number,
) {
  const title = `${bar.label || tr('Linear stock')} · ${formatLengthUnit(bar.length)}`;
  text(page, bold, title, M, topY, 11, INK);
  const bw = W - M * 2;
  const bh = 22;
  const oy = topY - 34;

  page.drawRectangle({
    x: M,
    y: oy,
    width: bw,
    height: bh,
    color: BOARD,
    borderColor: INK,
    borderWidth: 1,
  });

  const scale = bw / bar.length;
  for (const pos of bar.cutPositions) {
    const cx = M + pos * scale;
    page.drawLine({
      start: { x: cx, y: oy },
      end: { x: cx, y: oy + bh },
      thickness: 1.5,
      color: RIP,
      dashArray: [4, 3],
    });
  }

  const cutsSummary = bar.cutPositions.map((p) => formatLengthUnit(p)).join(', ');
  const piecesSummary = bar.pieceLengths.map((p) => formatLengthUnit(p)).join(' + ');
  text(
    page,
    regular,
    `${tr('Cross cut')}: ${cutsSummary}  →  ${piecesSummary}`,
    M,
    oy - 14,
    9,
    INK_2,
  );
}
