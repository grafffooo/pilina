// Builds the cutting-plan PDF: a summary page, then one page per sheet layout with its cut
// order. Inter is embedded, so Slovak and Czech text prints correctly.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { CostBreakdown, Job, Plan, SheetLayout } from '../engine/types';
import { formatMetres, formatMm, formatNumber, formatSquareMetres } from '../lib/format';
import { cutKindLabel, classifyOffcut, isRipLike, sizeOf, swatch } from '../model/describe';
import { unplacedReason, usedPercent } from '../model/job';
import { formatMoney, type Material } from '../model/library';
import type { Project } from '../model/project';
import { locale, t as tr } from '../i18n';

export interface PdfInput {
  project: Project;
  plan: Plan;
  job: Job;
  cost: CostBreakdown | null;
  materials: Material[];
  currency: string;
  /** For the header; injectable so tests are stable. */
  date?: Date;
}

export interface PdfFonts {
  regular: ArrayBuffer | Uint8Array;
  semibold: ArrayBuffer | Uint8Array;
}

// A4 portrait, points.
const W = 595.28;
const H = 841.89;
const M = 40;

const INK = hex('#2A2119');
const INK_2 = hex('#5E5040');
const INK_3 = hex('#7A6A57');
const RULE = hex('#DCCFBB');
const BOARD = hex('#EEE6D9');
const PART_STROKE = hex('#6A5B4A');
const RIP = hex('#DD6B0B');
const CROSS = hex('#B42318');
const ACCENT = hex('#8A5A34');
const WARN = hex('#8A4300');

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

interface Ctx {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  input: PdfInput;
  partIndex: Map<string, number>;
}

/** Text helper with the y axis pointing down from the top of the page, like the screen. */
function text(
  page: PDFPage,
  font: PDFFont,
  s: string,
  x: number,
  top: number,
  size: number,
  color: RGB = INK,
  align: 'left' | 'right' | 'center' = 'left',
) {
  const w = font.widthOfTextAtSize(s, size);
  const dx = align === 'right' ? -w : align === 'center' ? -w / 2 : 0;
  page.drawText(s, { x: x + dx, y: H - top - size * 0.8, size, font, color });
}

/** Shortens `s` with "…" until it fits `maxWidth`. */
function clip(font: PDFFont, s: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function rule(page: PDFPage, top: number, x1 = M, x2 = W - M) {
  page.drawLine({
    start: { x: x1, y: H - top },
    end: { x: x2, y: H - top },
    thickness: 0.5,
    color: RULE,
  });
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
  };

  summaryPages(ctx);
  input.plan.sheets.forEach((sheet, i) => sheetPage(ctx, sheet, i));

  // Footers once the page count is known.
  const pages = doc.getPages();
  const name = input.project.name || tr('Untitled project');
  pages.forEach((page, i) => {
    text(page, regular, clip(regular, name, 8, 300), M, H - 28, 8, INK_3);
    text(page, regular, `${i + 1} / ${pages.length}`, W - M, H - 28, 8, INK_3, 'right');
  });

  return doc.save();
}

// ---- Summary ----

function summaryPages(ctx: Ctx) {
  const { input, regular, bold } = ctx;
  const { project, plan, job, cost, currency } = input;
  let page = ctx.doc.addPage([W, H]);
  let y = M;

  const date = (input.date ?? new Date()).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  text(page, bold, clip(bold, project.name || tr('Untitled project'), 22, W - 2 * M), M, y, 22);
  y += 30;
  text(
    page,
    regular,
    tr('Cutting plan · {{date}} · kerf {{kerf}} mm · edge trim {{trim}} mm', {
      date,
      kerf: formatMm(job.kerf),
      trim: formatMm(job.trim ?? 0),
    }),
    M,
    y,
    9,
    INK_2,
  );
  y += 26;

  // Key numbers
  const t = plan.totals;
  const stats: [string, string][] = [
    [tr('Sheets'), formatNumber(t.sheets)],
    [tr('Material used'), `${formatNumber(Math.round(usedPercent(plan)))}%`],
    [tr('Cuts'), formatNumber(t.cuts)],
    [tr('Sawing'), formatMetres(t.cutLength)],
    [tr('Edge banding'), formatMetres(t.edgeBandLength)],
  ];
  if (cost) stats.push([tr('Cost'), formatMoney(cost.total, currency)]);
  const colW = (W - 2 * M) / stats.length;
  stats.forEach(([label, value], i) => {
    text(page, regular, label, M + i * colW, y, 8, INK_3);
    text(page, bold, value, M + i * colW, y + 12, 15);
  });
  y += 42;
  rule(page, y);
  y += 16;

  // Cost
  if (cost) {
    const costTitle = tr('Cost');
    text(page, bold, costTitle, M, y, 12);
    const modeText =
      project.pricing.mode === 'area'
        ? tr('Board charged by area used + {{pct}}% waste', {
            pct: formatNumber(project.pricing.wastePct),
          })
        : project.pricing.offcutCredit
          ? tr('Board charged by whole sheets, leftovers credited')
          : tr('Board charged by whole sheets');
    text(
      page,
      regular,
      modeText,
      M + bold.widthOfTextAtSize(costTitle, 12) + 12,
      y + 2,
      8.5,
      INK_3,
    );
    y += 20;
    const line = (label: string, note: string, amount: string, color: RGB = INK) => {
      text(page, regular, clip(regular, label, 9.5, 260), M, y, 9.5, color);
      if (note) text(page, regular, note, M + 270, y, 9.5, INK_3);
      text(page, regular, amount, W - M, y, 9.5, color, 'right');
      y += 15;
    };
    for (const m of cost.materials) {
      const note =
        project.pricing.mode === 'area'
          ? tr('{{area}} used', { area: formatSquareMetres(m.usedArea) })
          : tr('n_sheets', { count: m.sheets });
      line(
        m.material,
        note,
        m.priced ? formatMoney(m.gross, currency) : tr('no price'),
        m.priced ? INK : WARN,
      );
      if (m.credit > 0) {
        line(
          tr('Reusable leftovers credited'),
          formatSquareMetres(m.creditArea),
          `−${formatMoney(m.credit, currency)}`,
          ACCENT,
        );
      }
    }
    for (const b of cost.edgeBands) {
      line(
        b.band,
        formatMetres(b.length),
        b.priced ? formatMoney(b.cost, currency) : tr('no price'),
        b.priced ? INK : WARN,
      );
    }
    for (const x of project.pricing.extras.filter((e) => e.amount !== null)) {
      const qty = x.qty ?? 1;
      line(
        x.label || tr('Extra cost'),
        qty !== 1 ? `${formatNumber(qty)} × ${formatMoney(x.amount!, currency)}` : '',
        formatMoney(x.amount! * qty, currency),
      );
    }
    rule(page, y - 3, M + 270);
    y += 4;
    text(page, bold, tr('Total'), M + 270, y, 11);
    text(page, bold, formatMoney(cost.total, currency), W - M, y, 11, INK, 'right');
    y += 18;
    if (!cost.complete) {
      text(
        page,
        regular,
        tr('Some materials or edge bands have no price, so the total is incomplete.'),
        M,
        y,
        8.5,
        WARN,
      );
      y += 14;
    }
    y += 10;
  }

  // Parts that didn't fit
  if (plan.unplaced.length > 0) {
    const n = plan.unplaced.reduce((a, u) => a + u.count, 0);
    text(page, bold, tr('n_parts_dont_fit', { count: n }), M, y, 11, WARN);
    y += 16;
    for (const u of plan.unplaced) {
      const spec = job.parts.find((p) => p.id === u.partId);
      const why =
        spec && unplacedReason(spec, job) === 'too-big'
          ? tr('bigger than every stock sheet')
          : tr('not enough stock');
      const label = spec?.label || tr('Part');
      text(
        page,
        regular,
        `${label} ×${u.count}${spec ? ` (${formatMm(spec.length)} × ${formatMm(spec.width)})` : ''}: ${why}`,
        M,
        y,
        9,
        WARN,
      );
      y += 13;
    }
    y += 10;
  }

  // Parts table
  const materialName = new Map(input.materials.map((m) => [m.id, m.name]));
  const showMaterial = project.parts.some((p) => p.materialId);
  const cols = [
    { title: '', w: 14 },
    { title: tr('Label'), w: showMaterial ? 125 : 195 },
    { title: tr('Length'), w: 52, right: true },
    { title: tr('Width'), w: 52, right: true },
    { title: tr('Qty'), w: 34, right: true },
    { title: tr('Grain'), w: 50 },
    { title: tr('Edges'), w: 95 },
    ...(showMaterial ? [{ title: tr('Material'), w: 93 }] : []),
  ];
  const header = (p: PDFPage, top: number) => {
    text(p, bold, tr('Parts'), M, top, 12);
    let x = M;
    for (const c of cols) {
      text(
        p,
        bold,
        c.title.toUpperCase(),
        c.right ? x + c.w - 4 : x,
        top + 20,
        7,
        INK_3,
        c.right ? 'right' : 'left',
      );
      x += c.w;
    }
    rule(p, top + 31);
    return top + 36;
  };
  y = header(page, y);
  const rows = project.parts.filter((p) => p.enabled && p.length && p.width && p.qty);
  rows.forEach((p) => {
    if (y > H - M - 40) {
      page = ctx.doc.addPage([W, H]);
      y = header(page, M);
    }
    const i = ctx.partIndex.get(p.id) ?? 0;
    const e = p.edges;
    const long = Number(e.top) + Number(e.bottom);
    const short = Number(e.left) + Number(e.right);
    const edges =
      long + short === 0
        ? '—'
        : long + short === 4
          ? tr('all 4')
          : tr('{{long}} long, {{short}} short', { long, short });
    const grain =
      p.grain === 'none' ? tr('any') : p.grain === 'length' ? tr('length') : tr('width');
    const cells = [
      '',
      p.label || tr('Part {{n}}', { n: i + 1 }),
      formatMm(p.length!),
      formatMm(p.width!),
      formatNumber(p.qty!),
      grain,
      edges,
      ...(showMaterial ? [(p.materialId && materialName.get(p.materialId)) || tr('any')] : []),
    ];
    page.drawRectangle({
      x: M,
      y: H - y - 9,
      width: 8,
      height: 8,
      color: hex(swatch(i)),
      borderColor: PART_STROKE,
      borderWidth: 0.4,
    });
    let x = M;
    cells.forEach((c, ci) => {
      const col = cols[ci]!;
      if (ci > 0) {
        const s = clip(regular, c, 9, col.w - 8);
        text(
          page,
          regular,
          s,
          col.right ? x + col.w - 4 : x,
          y,
          9,
          INK,
          col.right ? 'right' : 'left',
        );
      }
      x += col.w;
    });
    y += 15;
  });
  y += 12;

  // Stock used
  if (y > H - M - 80) {
    page = ctx.doc.addPage([W, H]);
    y = M;
  }
  text(page, bold, tr('Stock sheets used'), M, y, 12);
  y += 20;
  const used = new Map<string, number>();
  plan.sheets.forEach((s) => used.set(s.stockId, (used.get(s.stockId) ?? 0) + s.qty));
  for (const s of job.stock) {
    const n = used.get(s.id) ?? 0;
    if (n === 0) continue;
    const name = s.label || tr('Unnamed material');
    text(page, regular, `${formatMm(s.length)} × ${formatMm(s.width)}`, M, y, 9.5);
    text(page, regular, clip(regular, name, 9.5, 300), M + 110, y, 9.5);
    text(page, bold, tr('n_sheets', { count: n }), W - M, y, 9.5, INK, 'right');
    y += 15;
  }
}

// ---- One sheet layout per page ----

function sheetPage(ctx: Ctx, sheet: SheetLayout, index: number) {
  const { input, regular, bold } = ctx;
  const { plan, job, project } = input;
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
      `${formatMm(sheet.length)} × ${formatMm(sheet.width)} mm`,
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
  text(
    page,
    regular,
    tr('Rip cuts (orange) run the full length; cross cuts (red) follow.'),
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
    text(page, bold, `${c.axis} = ${formatMm(c.pos)}`, x + 16, top, 8.5);
    text(page, regular, clip(regular, cutKindLabel(c), 8.5, 70), x + 76, top, 8.5, INK_2);
    text(page, regular, `${formatMm(c.length)}`, x + colW - 10, top, 8.5, INK_2, 'right');
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
    if (classifyOffcut(r) !== 'usable') continue;
    const z = sizeOf(r);
    label(
      page,
      regular,
      [`${formatMm(z.long)} × ${formatMm(z.short)}`],
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
      lines.push(`${formatMm(part.length)} × ${formatMm(part.width)}`);
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
