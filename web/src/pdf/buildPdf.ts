// Builds the cutting-plan PDF: a summary page, then one page per sheet layout with its cut
// order. Inter is embedded, so Slovak and Czech text prints correctly.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { BarLayout, LinearJob, LinearPlan, SheetLayout } from '../engine/types';
import { formatNumber } from '../lib/format';
import { formatLength, formatLengthUnit } from '../lib/units';
import { cutPosition, measureFromPiece } from '../model/cutMeasure';
import { cutKindLabel, isRipLike, sizeOf, swatch } from '../model/describe';
import { DEFAULT_LINEAR_OFFCUT_MIN, keepAdvice, linearKeepAdvice } from '../model/offcut';
import type { Project } from '../model/project';
import { t as tr } from '../i18n';
import {
  BOARD,
  CROSS,
  H,
  INK,
  INK_2,
  INK_3,
  M,
  PART_STROKE,
  RIP,
  W,
  clip,
  hex,
  rule,
  text,
  type Ctx,
  type PdfInput,
} from './draw';
import { summaryPage } from './summaryPage';

export type { PdfInput };

export interface PdfFonts {
  regular: ArrayBuffer | Uint8Array;
  semibold: ArrayBuffer | Uint8Array;
}

export async function buildPdf(input: PdfInput, fonts: PdfFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Embedded whole: pdf-lib's subsetting drops glyphs from these TTFs (blank letters in
  // most viewers), so the file is ~370 KB instead of ~20 KB.
  const regular = await doc.embedFont(fonts.regular, { subset: false });
  const bold = await doc.embedFont(fonts.semibold, { subset: false });
  doc.setTitle(input.project.name || tr('Cutting plan'));
  doc.setCreator('Pilina');
  doc.setProducer('Pilina');

  const ctx: Ctx = {
    doc,
    regular,
    bold,
    input,
    partIndex: new Map(input.project.parts.map((p, i) => [p.id, i])),
    linearPartIndex: new Map((input.project.linearParts ?? []).map((p, i) => [p.id, i])),
  };

  summaryPage(ctx);
  (input.plan?.sheets ?? []).forEach((sheet, i) => sheetPage(ctx, sheet, i));
  if (input.linearPlan && input.linearJob && input.linearPlan.bars.length > 0) {
    barPages(ctx, input.linearPlan, input.linearJob);
  }

  // Footers once the page count is known.
  const pages = doc.getPages();
  const name = input.project.name || tr('Untitled project');
  const setup = [
    input.job
      ? tr('kerf {{kerf}} · edge trim {{trim}}', {
          kerf: formatLengthUnit(input.job.kerf),
          trim: formatLengthUnit(input.job.trim ?? 0),
        })
      : input.linearJob
        ? tr('kerf {{kerf}} · end trim {{trim}}', {
            kerf: formatLengthUnit(input.linearJob.kerf),
            trim: formatLengthUnit(input.linearJob.endTrim ?? 0),
          })
        : null,
    input.job && input.linearJob && (input.linearJob.endTrim ?? 0) > 0
      ? `${tr('End trim')} ${formatLengthUnit(input.linearJob.endTrim!)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  pages.forEach((page, i) => {
    rule(page, H - 34);
    text(page, regular, clip(regular, `${name} · ${setup}`, 8, 400), M, H - 28, 8, INK_3);
    text(page, regular, `${i + 1} / ${pages.length}`, W - M, H - 28, 8, INK_3, 'right');
  });

  return doc.save();
}

// ---- One sheet layout per page ----

function sheetPage(ctx: Ctx, sheet: SheetLayout, index: number) {
  const { input, regular, bold } = ctx;
  const plan = input.plan!;
  const job = input.job!;
  const { project } = input;
  const page = ctx.doc.addPage([W, H]);
  const before = plan.sheets.slice(0, index).reduce((n, s) => n + s.qty, 0);
  const title =
    sheet.qty > 1
      ? tr('Sheets {{from}}–{{to}} of {{total}} (cut ×{{qty}})', {
          from: before + 1,
          to: before + sheet.qty,
          total: plan.totals.sheets,
          qty: sheet.qty,
        })
      : tr('Sheet {{n}} of {{total}}', { n: before + 1, total: plan.totals.sheets });
  const stock = job.stock.find((s) => s.id === sheet.stockId);
  const used =
    (sheet.placements.reduce((a, p) => a + p.rect.w * p.rect.h, 0) / (sheet.width * sheet.length)) *
    100;

  let y = M;
  text(page, bold, title, M, y, 15);
  y += 20;
  text(
    page,
    regular,
    [
      `${formatLength(sheet.length)} × ${formatLengthUnit(sheet.width)}`,
      stock?.label,
      tr('n_parts', { count: sheet.placements.length }),
      tr('{{pct}}% used', { pct: formatNumber(Math.round(used)) }),
      tr('n_cuts', { count: sheet.cuts.length }),
    ]
      .filter(Boolean)
      .join(' · '),
    M,
    y,
    9,
    INK_2,
  );
  y += 22;

  // The cut list: 3 columns of 13 pt rows under a 40 pt heading; the drawing gets the rest,
  // but never less than 60% of the page (very long lists continue in the drawing's numbers).
  const ROW = 13;
  const listRows = Math.ceil(sheet.cuts.length / 3);
  const listH = Math.min(H * 0.4 - 40, 40 + listRows * ROW + 4);
  const boxW = W - 2 * M;
  const boxH = H - y - M - 30 - listH;
  const scale = Math.min(boxW / sheet.width, boxH / sheet.length);
  const dw = sheet.width * scale;
  const dh = sheet.length * scale;
  const ox = M + (boxW - dw) / 2;
  const oy = y; // top of the drawing
  drawSheet(ctx, page, sheet, ox, oy, scale, project);

  // Cut order in columns
  let ly = oy + dh + 22;
  const orderTitle = tr('Cut order');
  text(page, bold, orderTitle, M, ly, 11);
  const from = input.cutMeasure ?? 'piece';
  const measures = measureFromPiece(sheet, job.kerf);
  text(
    page,
    regular,
    `${tr('Rip cuts (orange) run the full length; cross cuts (red) follow.')} ${
      from === 'piece'
        ? tr('Positions are measured from the last cut edge.')
        : tr('Positions are measured from the sheet edge.')
    }`,
    M + bold.widthOfTextAtSize(orderTitle, 11) + 12,
    ly + 1.5,
    8,
    INK_3,
  );
  ly += 18;
  const colW = (W - 2 * M) / 3;
  const perCol = Math.max(1, Math.min(listRows, Math.floor((H - M - 24 - ly) / ROW)));
  sheet.cuts.forEach((c, i) => {
    const col = Math.floor(i / perCol);
    if (col > 2) return; // very long lists are cut short; the drawing still shows every cut
    const x = M + col * colW;
    const top = ly + (i % perCol) * ROW;
    const color = isRipLike(c) ? RIP : CROSS;
    page.drawCircle({ x: x + 6, y: H - top - 4.5, size: 6, borderColor: color, borderWidth: 1 });
    text(page, bold, String(c.number), x + 6, top + 1, 6.5, INK, 'center');
    text(
      page,
      bold,
      `${c.axis} = ${formatLength(cutPosition(c, from, measures))}`,
      x + 16,
      top,
      8.5,
    );
    text(page, regular, clip(regular, cutKindLabel(c), 8.5, 70), x + 76, top, 8.5, INK_2);
    text(page, regular, `${formatLength(c.length)}`, x + colW - 10, top, 8.5, INK_2, 'right');
  });
  if (sheet.cuts.length > perCol * 3) {
    text(
      page,
      regular,
      tr('… and {{count}} more cuts (numbered on the drawing)', {
        count: sheet.cuts.length - perCol * 3,
      }),
      M,
      H - M - 30,
      8,
      INK_3,
    );
  }
}

function drawSheet(
  ctx: Ctx,
  page: PDFPage,
  sheet: SheetLayout,
  ox: number,
  oy: number,
  s: number,
  project: Project,
) {
  const { regular, bold } = ctx;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => H - (oy + y * s);
  const rect = (x: number, y: number, w: number, h: number) => ({
    x: X(x),
    y: Y(y + h),
    width: w * s,
    height: h * s,
  });

  page.drawRectangle({
    ...rect(0, 0, sheet.width, sheet.length),
    color: BOARD,
    borderColor: hex('#3A2E22'),
    borderWidth: 1.2,
  });

  // Reusable leftovers: their size, so they can be marked and kept.
  for (const r of sheet.waste) {
    if (keepAdvice(r, ctx.input.offcutRule) !== 'suggested') continue;
    const z = sizeOf(r);
    label(
      page,
      regular,
      [`${formatLength(z.long)} × ${formatLength(z.short)}`],
      X(r.x),
      Y(r.y),
      r.w * s,
      r.h * s,
      8,
      INK_3,
      regular,
    );
  }

  const parts = new Map(project.parts.map((p) => [p.id, p]));
  for (const p of sheet.placements) {
    const part = parts.get(p.partId);
    const i = ctx.partIndex.get(p.partId) ?? 0;
    const r = p.rect;
    page.drawRectangle({
      ...rect(r.x, r.y, r.w, r.h),
      color: hex(swatch(i)),
      borderColor: PART_STROKE,
      borderWidth: 0.6,
    });
    const lines = [part?.label || tr('Part {{n}}', { n: i + 1 })];
    if (part?.length && part.width)
      lines.push(`${formatLength(part.length)} × ${formatLength(part.width)}`);
    label(page, bold, lines, X(r.x), Y(r.y), r.w * s, r.h * s, 9, INK, regular);
  }

  for (const c of sheet.cuts) {
    const rip = isRipLike(c);
    page.drawLine({
      start: { x: X(c.x1), y: Y(c.y1) },
      end: { x: X(c.x2), y: Y(c.y2) },
      thickness: rip ? 1.4 : 1,
      color: rip ? RIP : CROSS,
      dashArray: rip ? undefined : [4, 2.5],
    });
  }
  // Cut numbers at the start of each cut, on top of everything.
  for (const c of sheet.cuts) {
    const rip = isRipLike(c);
    page.drawCircle({ x: X(c.x1), y: Y(c.y1), size: 5.5, color: rip ? RIP : CROSS });
    const n = String(c.number);
    const size = n.length > 2 ? 5 : 6;
    const w = bold.widthOfTextAtSize(n, size);
    page.drawText(n, {
      x: X(c.x1) - w / 2,
      y: Y(c.y1) - size * 0.36,
      size,
      font: bold,
      color: rip ? INK : rgb(1, 1, 1),
    });
  }
}

/** Centred label in a box (PDF coordinates: x left, yTop top edge), rotated if it fits better. */
function label(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  x: number,
  yTop: number,
  w: number,
  h: number,
  maxSize: number,
  color: RGB,
  secondFont: PDFFont,
) {
  for (let size = maxSize; size >= 4.5; size *= 0.88) {
    const widths = lines.map((l, i) =>
      (i === 0 ? font : secondFont).widthOfTextAtSize(l, i === 0 ? size : size * 0.85),
    );
    const tw = Math.max(...widths);
    const th = size * 1.25 * lines.length;
    const horizontal = tw <= w * 0.9 && th <= h * 0.9;
    const vertical = !horizontal && tw <= h * 0.9 && th <= w * 0.9;
    if (!horizontal && !vertical) continue;
    const cx = x + w / 2;
    const cy = yTop - h / 2;
    lines.forEach((line, i) => {
      const f = i === 0 ? font : secondFont;
      const sz = i === 0 ? size : size * 0.85;
      const lw = f.widthOfTextAtSize(line, sz);
      const offset = (i - (lines.length - 1) / 2) * size * 1.25; // line centre, along the reading-down axis
      if (horizontal) {
        page.drawText(line, {
          x: cx - lw / 2,
          y: cy - offset - sz * 0.35,
          size: sz,
          font: f,
          color: i === 0 ? color : INK_2,
        });
      } else {
        // Reads bottom to top; "down" between lines is +x.
        page.drawText(line, {
          x: cx + offset + sz * 0.35,
          y: cy - lw / 2,
          size: sz,
          font: f,
          color: i === 0 ? color : INK_2,
          rotate: degrees(90),
        });
      }
    });
    return;
  }
}

// ---- Linear bar pages (packed multiple bars per page) ----

function barPages(ctx: Ctx, linearPlan: LinearPlan, linearJob: LinearJob) {
  const { input, regular, bold } = ctx;
  const linearMin = input.linearOffcutMinLength ?? DEFAULT_LINEAR_OFFCUT_MIN;
  const partsById = new Map((input.project.linearParts ?? []).map((p) => [p.id, p]));
  const boxW = W - 2 * M;
  const ROW = 13;
  const BAR_H = 38;
  const colW = boxW / 3;

  let page: PDFPage | null = null;
  let y = M;
  let before = 0;

  linearPlan.bars.forEach((bar, index) => {
    const shownCuts = Math.min(bar.cuts.length, 30);
    const listRows = Math.ceil(shownCuts / 3);
    const cutListH =
      bar.cuts.length === 0 ? 18 : listRows * ROW + (bar.cuts.length > 30 ? 14 : 0);
    const blockH = 40 + 18 + BAR_H + 22 + 20 + cutListH;

    if (!page || y + blockH > H - M - 40) {
      page = ctx.doc.addPage([W, H]);
      y = M;
      if (index === 0 && (input.plan?.sheets.length ?? 0) > 0) {
        text(page, bold, tr('Linear stock').toUpperCase(), M, y, 7.5, INK_3);
        y += 14;
      }
    } else {
      rule(page, y - 10);
    }

    const title =
      bar.qty > 1
        ? tr('Bars {{from}}–{{to}} of {{total}} (cut ×{{qty}})', {
            from: before + 1,
            to: before + bar.qty,
            total: linearPlan.totals.bars,
            qty: bar.qty,
          })
        : tr('Bar {{n}} of {{total}}', { n: before + 1, total: linearPlan.totals.bars });
    before += bar.qty;

    const stock = linearJob.stock.find((s) => s.id === bar.stockId);
    const used =
      bar.length > 0
        ? (bar.placements.reduce((a, p) => a + p.length, 0) / bar.length) * 100
        : 0;

    text(page, bold, title, M, y, 13);
    y += 17;
    text(
      page,
      regular,
      [
        formatLengthUnit(bar.length),
        stock?.label,
        tr('n_parts', { count: bar.placements.length }),
        tr('{{pct}}% used', { pct: formatNumber(Math.round(used)) }),
        tr('n_cuts', { count: bar.cuts.length }),
      ]
        .filter(Boolean)
        .join(' · '),
      M,
      y,
      8.5,
      INK_2,
    );
    y += 18;

    const oy = y + 16;
    drawBarPdf(ctx, page, bar, M, oy, boxW, BAR_H, linearMin, partsById);
    let ly = oy + BAR_H + 22;

    const orderTitle = tr('Cut order');
    text(page, bold, orderTitle, M, ly, 10.5);
    text(
      page,
      regular,
      tr('stop-block length'),
      M + bold.widthOfTextAtSize(orderTitle, 10.5) + 10,
      ly + 1,
      8,
      INK_3,
    );
    ly += 17;

    if (bar.cuts.length === 0) {
      text(page, regular, tr('This bar is used whole: no cuts needed.'), M, ly, 8.5, INK_2);
      ly += 18;
    } else {
      const perCol = Math.max(1, listRows);
      bar.cuts.slice(0, 30).forEach((c, i) => {
        const col = Math.floor(i / perCol);
        const x = M + col * colW;
        const top = ly + (i % perCol) * ROW;
        const trim = c.stage === 0;
        const color = trim ? RIP : CROSS;
        page!.drawCircle({ x: x + 6, y: H - top - 4.5, size: 5.5, borderColor: color, borderWidth: 1 });
        text(page!, bold, String(c.number), x + 6, top + 1, 6, INK, 'center');
        text(page!, bold, formatLength(c.fromLastEdge), x + 15, top, 8.5);
        text(
          page!,
          regular,
          clip(regular, trim ? tr('End trim') : tr('Cross cut'), 8.5, 68),
          x + 56,
          top,
          8.5,
          INK_2,
        );
        text(
          page!,
          regular,
          `@ ${formatLength(c.pos)}`,
          x + colW - 10,
          top,
          8,
          INK_3,
          'right',
        );
      });
      ly += perCol * ROW;
      if (bar.cuts.length > 30) {
        text(
          page,
          regular,
          tr('… and {{count}} more cuts (numbered on the drawing)', {
            count: bar.cuts.length - 30,
          }),
          M,
          ly,
          8,
          INK_3,
        );
        ly += 14;
      }
    }

    y = ly + 20;
  });
}

function drawBarPdf(
  ctx: Ctx,
  page: PDFPage,
  bar: BarLayout,
  ox: number,
  oy: number,
  width: number,
  barH: number,
  linearMin: number,
  partsById: Map<string, { label?: string }>,
) {
  const { regular, bold } = ctx;
  const s = bar.length > 0 ? width / bar.length : 1;
  const X = (x: number) => ox + x * s;
  const Y = (yPos: number) => H - yPos;

  page.drawRectangle({
    x: ox,
    y: Y(oy + barH),
    width,
    height: barH,
    color: BOARD,
    borderColor: hex('#3A2E22'),
    borderWidth: 1,
  });

  if (bar.waste > 0 && linearKeepAdvice(bar.waste, linearMin) === 'suggested') {
    const wx = X(bar.offcutStart);
    const ww = bar.waste * s;
    page.drawRectangle({
      x: wx,
      y: Y(oy + barH),
      width: ww,
      height: barH,
      color: hex('#F1E3D1'),
      borderColor: hex('#8A5A34'),
      borderWidth: 0.7,
      borderDashArray: [3, 2],
    });
    label(page, regular, [formatLength(bar.waste)], wx, oy, ww, barH, 8, INK_3, regular);
  }

  for (const p of bar.placements) {
    const px = X(p.x);
    const pw = p.length * s;
    const i = ctx.linearPartIndex.get(p.partId) ?? 0;
    page.drawRectangle({
      x: px,
      y: Y(oy + barH),
      width: pw,
      height: barH,
      color: hex(swatch(i)),
      borderColor: PART_STROKE,
      borderWidth: 0.6,
    });
    const part = partsById.get(p.partId);
    const lines = [part?.label || tr('Part {{n}}', { n: i + 1 }), formatLength(p.length)];
    label(page, bold, lines, px, oy, pw, barH, 8.5, INK, regular);
  }

  let prevBadgeX = -Infinity;
  for (const c of bar.cuts) {
    const cx = X(c.pos);
    const trim = c.stage === 0;
    page.drawLine({
      start: { x: cx, y: Y(oy) },
      end: { x: cx, y: Y(oy + barH) },
      thickness: trim ? 1.3 : 1,
      color: trim ? RIP : CROSS,
      dashArray: trim ? undefined : [3.5, 2],
    });
    const bx = Math.min(ox + width - 6, Math.max(ox + 6, cx, prevBadgeX + 12));
    prevBadgeX = bx;
    page.drawCircle({ x: bx, y: Y(oy - 8), size: 5.5, color: trim ? RIP : CROSS });
    const n = String(c.number);
    const sz = n.length > 2 ? 5 : 6;
    const nw = bold.widthOfTextAtSize(n, sz);
    page.drawText(n, {
      x: bx - nw / 2,
      y: Y(oy - 8) - sz * 0.36,
      size: sz,
      font: bold,
      color: trim ? INK : rgb(1, 1, 1),
    });
  }

  text(page, regular, '0', ox, oy + barH + 5, 7.5, INK_3);
  text(page, regular, formatLengthUnit(bar.length), ox + width, oy + barH + 5, 7.5, INK_3, 'right');
}
