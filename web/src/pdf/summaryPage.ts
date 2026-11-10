// Page 1 of the cutting plan, as on the design canvas ("Cutting plan PDF, page 1"):
// a header with the total, the first sheet to scale beside how the board is used, key facts,
// materials and cost, then the parts drawn to scale with their banded edges and a tick box.
import { LineCapStyle, type PDFPage, type RGB } from 'pdf-lib';
import type { Rect, SheetLayout } from '../engine/types';
import { formatNumber } from '../lib/format';
import { formatArea, formatLength, formatLengthUnit, formatLong } from '../lib/units';
import { classifyOffcut, sizeOf, swatch } from '../model/describe';
import { unplacedReason } from '../model/job';
import { formatMoney } from '../model/library';
import type { PartRow } from '../model/project';
import { locale, t as tr } from '../i18n';
import { ACCENT, INK, INK_2, INK_3, M, W, H, WARN, clip, hex, rule, text, type Ctx } from './draw';

const LEFTOVER = hex('#DDBF98');
const HATCH_BG = hex('#F7F2EA');
const HATCH = hex('#D9CDB9');
const SOFT = hex('#F1E3D1');
const SOFT_INK = hex('#6B4426');
const BAND = hex('#6B4426');
const PLAIN = hex('#9A8A74');
const GRID = hex('#E2D6C3');
const GRID_OUT = hex('#CDBEA6');
const THUMB_PART = hex('#7A6A57');

/** Board area split, mm². */
interface Use {
  sheet: number;
  parts: number;
  leftovers: number;
}

const area = (r: Rect) => r.w * r.h;

function sheetUse(s: SheetLayout): Use {
  return {
    sheet: s.length * s.width * s.qty,
    parts: s.placements.reduce((a, p) => a + area(p.rect), 0) * s.qty,
    leftovers:
      s.waste.filter((r) => classifyOffcut(r) === 'usable').reduce((a, r) => a + area(r), 0) *
      s.qty,
  };
}

const addUse = (a: Use, b: Use): Use => ({
  sheet: a.sheet + b.sheet,
  parts: a.parts + b.parts,
  leftovers: a.leftovers + b.leftovers,
});

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Diagonal lines filling a box: the drawing's sign for waste. */
function hatch(page: PDFPage, x: number, top: number, w: number, h: number, gap: number) {
  page.drawRectangle({ x, y: H - top - h, width: w, height: h, color: HATCH_BG });
  for (let k = -h; k < w; k += gap) {
    const t0 = Math.max(0, -k);
    const t1 = Math.min(h, w - k);
    if (t1 <= t0) continue;
    page.drawLine({
      start: { x: x + k + t0, y: H - (top + h - t0) },
      end: { x: x + k + t1, y: H - (top + h - t1) },
      thickness: 0.6,
      color: HATCH,
    });
  }
}

function box(
  page: PDFPage,
  x: number,
  top: number,
  w: number,
  h: number,
  o: { fill?: RGB; border?: RGB; borderWidth?: number; dash?: number[] } = {},
) {
  page.drawRectangle({
    x,
    y: H - top - h,
    width: w,
    height: h,
    color: o.fill,
    borderColor: o.border,
    borderWidth: o.border ? (o.borderWidth ?? 0.75) : 0,
    borderDashArray: o.dash,
  });
}

/** Parts / reusable leftovers / waste as one bar. */
function drawUseBar(page: PDFPage, x: number, top: number, w: number, h: number, use: Use) {
  const p = (use.parts / use.sheet) * w;
  const l = (use.leftovers / use.sheet) * w;
  hatch(page, x, top, w, h, 2.5);
  box(page, x, top, p, h, { fill: ACCENT });
  box(page, x + p, top, l, h, { fill: LEFTOVER });
  box(page, x, top, w, h, { border: INK, borderWidth: 0.6 });
}

// Icons from the canvas (24-unit SVG paths), drawn in a soft circle.
const ICONS: Record<
  string,
  { path: string; extra?: { path: string; width?: number; dash?: number[] } }
> = {
  sheets: { path: 'M12 4L3 8.5l9 4.5 9-4.5zM3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5' },
  cuts: { path: 'M3 5h18v14H3zM10 3v18M10 12h11' },
  sawing: { path: 'M2 8h20v8H2zM6 8v3M10 8v4M14 8v3M18 8v4' },
  banding: { path: 'M4 7h16v12H4z', extra: { path: 'M3 5h18', width: 3 } },
  kerf: {
    path: 'M3 4h6v16H3zM15 4h6v16h-6zM12 9v6M10.5 7.5l1.5 1.5 1.5-1.5M10.5 16.5l1.5-1.5 1.5 1.5',
  },
  trim: { path: 'M3 3h18v18H3z', extra: { path: 'M7 7h10v10H7z', dash: [2, 2] } },
};

function icon(page: PDFPage, name: keyof typeof ICONS, cx: number, cy: number) {
  page.drawCircle({ x: cx, y: H - cy, size: 11.5, color: SOFT });
  const s = 13.5 / 24;
  const o = { x: cx - 12 * s, y: H - (cy - 12 * s), scale: s, borderColor: SOFT_INK };
  const { path, extra } = ICONS[name]!;
  page.drawSvgPath(path, { ...o, borderWidth: 1.8, borderLineCap: LineCapStyle.Round });
  if (extra) {
    page.drawSvgPath(extra.path, {
      ...o,
      borderWidth: extra.width ?? 1.8,
      borderDashArray: extra.dash,
      borderLineCap: LineCapStyle.Round,
    });
  }
}

export function summaryPage(ctx: Ctx) {
  const { input, regular, bold } = ctx;
  const { project, plan, job, cost, currency, materials } = input;
  let page = ctx.doc.addPage([W, H]);
  const right = W - M;

  const stockById = new Map(job.stock.map((s) => [s.id, s]));
  const materialOf = (stockId: string) => {
    const s = stockById.get(stockId);
    return materials.find((m) => m.id === s?.material) ?? null;
  };
  const boardName = (stockId: string) =>
    stockById.get(stockId)?.label || materialOf(stockId)?.name || tr('Unnamed material');

  // ---- Header ----
  let y = M;
  const date = (input.date ?? new Date()).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const pieces = plan.sheets.reduce((n, s) => n + s.placements.length * s.qty, 0);
  const boards = [...new Set(plan.sheets.map((s) => boardName(s.stockId)))];
  let titleRight = right;
  if (cost) {
    const total = formatMoney(cost.total, currency);
    text(page, bold, tr('Total cost').toUpperCase(), right, y, 7.5, INK_3, 'right');
    text(page, bold, total, right, y + 12, 24, INK, 'right');
    const note =
      project.pricing.mode === 'area'
        ? tr('board by area used + {{pct}}% waste', {
            pct: formatNumber(project.pricing.wastePct),
          })
        : project.pricing.offcutCredit
          ? tr('board by whole sheets, leftovers credited')
          : tr('board by whole sheets');
    text(page, regular, note, right, y + 42, 8.5, INK_2, 'right');
    titleRight =
      right -
      Math.max(bold.widthOfTextAtSize(total, 24), regular.widthOfTextAtSize(note, 8.5)) -
      24;
  }
  text(page, bold, tr('Cutting plan').toUpperCase(), M, y, 7.5, INK_3);
  const name = project.name || tr('Untitled project');
  text(page, bold, clip(bold, name, 24, titleRight - M), M, y + 12, 24);
  text(
    page,
    regular,
    clip(
      regular,
      [
        date,
        tr('n_parts', { count: pieces }),
        tr('n_sheets', { count: plan.totals.sheets }),
        ...boards,
      ]
        .filter(Boolean)
        .join(' · '),
      9.5,
      titleRight - M,
    ),
    M,
    y + 42,
    9.5,
    INK_2,
  );
  y += 60;
  page.drawLine({
    start: { x: M, y: H - y },
    end: { x: right, y: H - y },
    thickness: 1.1,
    color: INK,
  });
  y += 20;

  // ---- At a glance: the first sheet to scale, board use, key facts ----
  const top = y;
  const first = plan.sheets[0];
  let figureBottom = top;
  if (first) {
    const scale = Math.min(126 / first.width, 170 / first.length);
    const tw = first.width * scale;
    const th = first.length * scale;
    hatch(page, M, top, tw, th, 2.5);
    for (const r of first.waste) {
      if (classifyOffcut(r) !== 'usable') continue;
      box(page, M + r.x * scale, top + r.y * scale, r.w * scale, r.h * scale, {
        fill: LEFTOVER,
        border: ACCENT,
        borderWidth: 0.5,
        dash: [2, 1.5],
      });
    }
    for (const p of first.placements) {
      const r = p.rect;
      box(page, M + r.x * scale, top + r.y * scale, r.w * scale, r.h * scale, {
        fill: hex(swatch(ctx.partIndex.get(p.partId) ?? 0)),
        border: THUMB_PART,
        borderWidth: 0.4,
      });
    }
    box(page, M, top, tw, th, { border: INK, borderWidth: 1.1 });
    const cy = top + th + 8;
    const caption =
      first.qty > 1 ? tr('Sheets 1–{{to}}', { to: first.qty }) : tr('Sheet {{n}}', { n: 1 });
    text(page, bold, caption, M, cy, 9.5);
    text(
      page,
      regular,
      tr('page {{n}}', { n: 2 }),
      M + bold.widthOfTextAtSize(caption, 9.5) + 4,
      cy + 0.5,
      9,
      INK_3,
    );
    text(
      page,
      regular,
      `${formatLength(first.length)} × ${formatLengthUnit(first.width)} · ${tr('n_cuts', { count: first.cuts.length })}`,
      M,
      cy + 13,
      9,
      INK_2,
    );
    if (plan.sheets.length > 1) {
      text(
        page,
        regular,
        tr('more_layouts', { count: plan.sheets.length - 1 }),
        M,
        cy + 25,
        9,
        INK_3,
      );
    }
    figureBottom = cy + (plan.sheets.length > 1 ? 36 : 24);
  }

  const cx = first ? M + 147 : M;
  const cw = right - cx;
  const use = plan.sheets.map(sheetUse).reduce(addUse, { sheet: 0, parts: 0, leftovers: 0 });
  const waste = Math.max(0, use.sheet - use.parts - use.leftovers);
  const partsPct = Math.round(pct(use.parts, use.sheet));
  const big = `${formatNumber(partsPct)}%`;
  text(page, bold, big, cx, top, 24);
  text(
    page,
    regular,
    tr('of the board ends up in parts'),
    cx + bold.widthOfTextAtSize(big, 24) + 8,
    top + 9,
    9.5,
    INK_2,
  );
  if (use.sheet > 0) drawUseBar(page, cx, top + 32, cw, 13, use);

  // Legend: parts, reusable leftovers (with their sizes), waste.
  const leftoverSizes = new Map<string, number>();
  for (const s of plan.sheets) {
    for (const r of s.waste) {
      if (classifyOffcut(r) !== 'usable') continue;
      const z = sizeOf(r);
      const key = `${formatLength(z.long)} × ${formatLength(z.short)}`;
      leftoverSizes.set(key, (leftoverSizes.get(key) ?? 0) + s.qty);
    }
  }
  const sizes = [...leftoverSizes]
    .slice(0, 3)
    .map(([k, n]) => (n > 1 ? `${k} ×${n}` : k))
    .join(', ');
  const legend: [string, string, number, (x: number, t: number) => void][] = [
    [tr('Parts'), '', use.parts, (x, t) => box(page, x, t, 9, 9, { fill: ACCENT })],
    [
      tr('Reusable leftovers'),
      sizes ? ` · ${sizes}${leftoverSizes.size > 3 ? ' …' : ''}` : '',
      use.leftovers,
      (x, t) => box(page, x, t, 9, 9, { fill: LEFTOVER, border: ACCENT, borderWidth: 0.6 }),
    ],
    [
      tr('Waste and saw kerf'),
      '',
      waste,
      (x, t) => {
        hatch(page, x, t, 9, 9, 2);
        box(page, x, t, 9, 9, { border: PLAIN, borderWidth: 0.6 });
      },
    ],
  ];
  let ly = top + 55;
  for (const [label, note, a, swatchFn] of legend) {
    swatchFn(cx, ly);
    const pctText = `${formatNumber(Math.round(pct(a, use.sheet)))}%`;
    text(page, bold, pctText, right, ly, 9.5, INK, 'right');
    const areaText = formatArea(a);
    text(page, regular, areaText, right - 36, ly, 9.5, INK_2, 'right');
    const room = cw - 16 - 36 - regular.widthOfTextAtSize(areaText, 9.5) - 12;
    const lw = regular.widthOfTextAtSize(label, 9.5);
    text(page, regular, label, cx + 16, ly, 9.5);
    if (note)
      text(page, regular, clip(regular, note, 9.5, room - lw), cx + 16 + lw, ly, 9.5, INK_2);
    ly += 15;
  }

  // Facts: 3 × 2 grid with icons.
  const t = plan.totals;
  const facts: [keyof typeof ICONS, string, string][] = [
    ['sheets', tr('Sheets'), formatNumber(t.sheets)],
    ['cuts', tr('Cuts'), formatNumber(t.cuts)],
    ['sawing', tr('Sawing'), formatLong(t.cutLength)],
    ['banding', tr('Edge banding'), formatLong(t.edgeBandLength)],
    ['kerf', tr('Saw kerf'), formatLengthUnit(job.kerf)],
    ['trim', tr('Edge trim'), formatLengthUnit(job.trim ?? 0)],
  ];
  const gy = ly + 8;
  const colW = cw / 3;
  const rowH = 34;
  facts.forEach(([ic, label, value], i) => {
    const x = cx + (i % 3) * colW;
    const ry = gy + Math.floor(i / 3) * rowH;
    icon(page, ic, x + 20, ry + rowH / 2);
    text(page, regular, label, x + 38, ry + 7, 8.5, INK_3);
    text(page, bold, clip(bold, value, 12, colW - 44), x + 38, ry + 18, 12);
  });
  for (let c = 1; c < 3; c++) {
    page.drawLine({
      start: { x: cx + c * colW, y: H - gy },
      end: { x: cx + c * colW, y: H - (gy + 2 * rowH) },
      thickness: 0.6,
      color: GRID,
    });
  }
  page.drawLine({
    start: { x: cx, y: H - (gy + rowH) },
    end: { x: right, y: H - (gy + rowH) },
    thickness: 0.6,
    color: GRID,
  });
  box(page, cx, gy, cw, 2 * rowH, { border: GRID_OUT, borderWidth: 0.75 });

  y = Math.max(figureBottom, gy + 2 * rowH) + 24;

  // ---- Materials and cost ----
  text(page, bold, cost ? tr('Materials and cost') : tr('Materials'), M, y, 12);
  y += 22;
  const C = { amount: M + 210, use: M + 360, use2: M + 360 + 96 };
  const head = (labels: [string, number, 'left' | 'right'][]) => {
    for (const [l, x, a] of labels) text(page, bold, l.toUpperCase(), x, y, 7, INK_3, a);
    y += 12;
    page.drawLine({
      start: { x: M, y: H - y },
      end: { x: right, y: H - y },
      thickness: 0.75,
      color: INK,
    });
  };
  head([
    [tr('Material'), M, 'left'],
    [tr('Amount'), C.amount, 'left'],
    [tr('Board use'), C.use, 'left'],
    ...(cost ? ([[tr('Cost'), right, 'right']] as [string, number, 'right'][]) : []),
  ]);
  const row = (draw: (top: number) => void, h = 22) => {
    draw(y + 7);
    y += h;
    rule(page, y, M, right);
  };

  // One row per board, with its sheets, area used and how the board was used.
  const byBoard = new Map<string, SheetLayout[]>();
  for (const s of plan.sheets) {
    const k = boardName(s.stockId);
    byBoard.set(k, [...(byBoard.get(k) ?? []), s]);
  }
  let boardCost = 0;
  for (const [board, sheets] of byBoard) {
    const m = materialOf(sheets[0]!.stockId);
    const u = sheets.map(sheetUse).reduce(addUse, { sheet: 0, parts: 0, leftovers: 0 });
    const n = sheets.reduce((a, s) => a + s.qty, 0);
    const sizesText = [
      ...new Set(sheets.map((s) => `${formatLength(s.length)} × ${formatLength(s.width)}`)),
    ]
      .slice(0, 2)
      .join(', ');
    const mc = cost?.materials.find((x) => x.material === board);
    if (mc) boardCost += mc.cost;
    row((top) => {
      box(page, M, top + 0.5, 9, 9, { fill: hex(m?.color ?? '#6B5844') });
      const bw = bold.widthOfTextAtSize(board, 9.5);
      const nameW = Math.min(bw, C.amount - M - 30);
      text(page, bold, clip(bold, board, 9.5, C.amount - M - 30), M + 15, top, 9.5);
      if (nameW + 15 < C.amount - M - 60) {
        text(
          page,
          regular,
          clip(regular, ` · ${sizesText}`, 9.5, C.amount - M - 30 - nameW - 15),
          M + 15 + nameW,
          top,
          9.5,
          INK_2,
        );
      }
      text(
        page,
        regular,
        clip(
          regular,
          `${tr('n_sheets', { count: n })} · ${tr('{{area}} used', { area: formatArea(u.parts) })}`,
          9.5,
          C.use - C.amount - 10,
        ),
        C.amount,
        top,
        9.5,
        INK_2,
      );
      if (u.sheet > 0) drawUseBar(page, C.use, top + 2, 90, 6, u);
      if (cost) {
        text(
          page,
          regular,
          mc && !mc.priced ? tr('no price') : formatMoney(mc?.gross ?? 0, currency),
          right,
          top,
          9.5,
          mc && !mc.priced ? WARN : INK,
          'right',
        );
      }
    });
    if (mc && mc.credit > 0) {
      row((top) => {
        text(page, regular, tr('Reusable leftovers credited'), M + 15, top, 9.5, ACCENT);
        text(page, regular, formatArea(mc.creditArea), C.amount, top, 9.5, INK_2);
        text(
          page,
          regular,
          `−${formatMoney(mc.credit, currency)}`,
          right,
          top,
          9.5,
          ACCENT,
          'right',
        );
      });
    }
  }
  // Materials the cost knows that no drawn sheet carries (shouldn't happen, but keep the sum honest).
  for (const mc of cost?.materials ?? []) {
    if (!byBoard.has(mc.material)) boardCost += mc.cost;
  }
  let bandCost = 0;
  for (const b of cost?.edgeBands ?? []) {
    bandCost += b.cost;
    row((top) => {
      box(page, M, top + 3.5, 9, 2.5, { fill: BAND });
      const bw = bold.widthOfTextAtSize(b.band, 9.5);
      text(page, bold, clip(bold, b.band, 9.5, C.amount - M - 30), M + 15, top, 9.5);
      text(page, regular, ` ${tr('edge band')}`, M + 15 + bw, top, 9.5, INK_2);
      text(page, regular, formatLong(b.length), C.amount, top, 9.5, INK_2);
      text(
        page,
        regular,
        b.priced ? formatMoney(b.cost, currency) : tr('no price'),
        right,
        top,
        9.5,
        b.priced ? INK : WARN,
        'right',
      );
    });
  }
  const extras = project.pricing.extras.filter((e) => e.amount !== null);
  for (const x of cost ? extras : []) {
    const qty = x.qty ?? 1;
    row((top) => {
      text(
        page,
        bold,
        clip(bold, x.label || tr('Extra cost'), 9.5, C.amount - M - 30),
        M + 15,
        top,
        9.5,
      );
      if (qty !== 1) {
        text(
          page,
          regular,
          `${formatNumber(qty)} × ${formatMoney(x.amount!, currency)}`,
          C.amount,
          top,
          9.5,
          INK_2,
        );
      }
      text(page, regular, formatMoney(x.amount! * qty, currency), right, top, 9.5, INK, 'right');
    });
  }

  if (cost) {
    y += 9;
    // How the money splits: board, edge banding, extras.
    const parts: [string, number, RGB][] = (
      [
        [tr('Board'), boardCost, hex('#6B5844')],
        [tr('edge banding'), bandCost, BAND],
        [tr('extras'), cost.extras, hex('#C9A77F')],
      ] as [string, number, RGB][]
    ).filter(([, v]) => v > 0);
    const sum = parts.reduce((a, [, v]) => a + v, 0);
    if (sum > 0) {
      let bx = M;
      for (const [, v, c] of parts) {
        const w = (v / sum) * 120;
        box(page, bx, y + 3, w, 6, { fill: c });
        bx += w;
      }
      box(page, M, y + 3, 120, 6, { border: PLAIN, borderWidth: 0.5 });
      text(
        page,
        regular,
        parts.map(([l, v]) => `${l} ${formatNumber(Math.round(pct(v, sum)))}%`).join(' · '),
        M + 128,
        y + 1.5,
        8.5,
        INK_2,
      );
    }
    text(page, bold, tr('Total'), C.use, y, 11);
    text(page, bold, formatMoney(cost.total, currency), right, y - 1, 13, INK, 'right');
    y += 20;
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
  }
  y += 14;

  // ---- Parts that didn't fit ----
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
        `${label} ×${u.count}${spec ? ` (${formatLength(spec.length)} × ${formatLength(spec.width)})` : ''}: ${why}`,
        M,
        y,
        9,
        WARN,
      );
      y += 13;
    }
    y += 10;
  }

  // ---- Parts, drawn to scale ----
  const rows = project.parts.filter((p) => p.enabled && p.length && p.width && p.qty);
  const longest = Math.max(1, ...rows.map((p) => Math.max(p.length!, p.width!)));
  const S = 33 / longest;
  const allowance = input.edgeAllowance ?? 0;
  const P = {
    shape: M + 20,
    label: M + 62,
    size: M + 300,
    qty: M + 336,
    grain: M + 350,
  };
  const ROW = 38;

  const piecesText = tr('n_pieces', { count: rows.reduce((a, p) => a + p.qty!, 0) });
  const partsHead = (first: boolean) => {
    const title = tr('Parts');
    text(page, bold, title, M, y, 12);
    if (first) {
      text(
        page,
        regular,
        tr('{{pieces}} · drawn to scale, edge band in dark brown · tick them off at the saw', {
          pieces: piecesText,
        }),
        M + bold.widthOfTextAtSize(title, 12) + 10,
        y + 2.5,
        8.5,
        INK_2,
      );
    }
    y += 22;
    head([
      [tr('Part'), P.label, 'left'],
      [tr('Length × width'), P.size, 'right'],
      [tr('Qty'), P.qty, 'right'],
      [tr('Grain'), P.grain, 'left'],
      [tr('Edge band'), right, 'right'],
    ]);
  };
  const ensure = (h: number) => {
    if (y + h > H - M - 34) {
      page = ctx.doc.addPage([W, H]);
      y = M;
      partsHead(false);
    }
  };

  if (rows.length > 0) {
    ensure(120);
    partsHead(true);
  }

  // Grouped by board when parts name one; otherwise one list.
  const groups = new Map<string | null, PartRow[]>();
  for (const p of rows) groups.set(p.materialId, [...(groups.get(p.materialId) ?? []), p]);
  const groupName = (id: string | null) =>
    id
      ? (materials.find((m) => m.id === id)?.name ?? tr('Unnamed material'))
      : groups.size > 1
        ? tr('Any board')
        : boards.length === 1
          ? boards[0]!
          : '';

  for (const [id, list] of groups) {
    const g = groupName(id);
    if (g) {
      ensure(18 + ROW);
      text(page, bold, g, M, y + 7, 8.5, INK_2);
      y += 20;
    }
    for (const p of list) {
      ensure(ROW);
      const i = ctx.partIndex.get(p.id) ?? 0;
      const mid = y + ROW / 2;
      // Tick box
      box(page, M, mid - 5.5, 11, 11, { border: INK_2, borderWidth: 1.1 });
      // Silhouette: length across, width down; banded edges thick and dark.
      const w = Math.max(5, p.length! * S);
      const h = Math.max(5, p.width! * S);
      const sx = P.shape + (36 - w) / 2;
      const sy = mid - h / 2;
      box(page, sx, sy, w, h, { fill: hex(swatch(i)) });
      const edge = (on: boolean, x1: number, y1: number, x2: number, y2: number) =>
        page.drawLine({
          start: { x: x1, y: H - y1 },
          end: { x: x2, y: H - y2 },
          thickness: on ? 2.2 : 0.6,
          color: on ? BAND : PLAIN,
          lineCap: LineCapStyle.Projecting,
        });
      const e = p.edges;
      const inset = (on: boolean) => (on ? 1.1 : 0.3);
      edge(e.top, sx, sy + inset(e.top), sx + w, sy + inset(e.top));
      edge(e.bottom, sx, sy + h - inset(e.bottom), sx + w, sy + h - inset(e.bottom));
      edge(e.left, sx + inset(e.left), sy, sx + inset(e.left), sy + h);
      edge(e.right, sx + w - inset(e.right), sy, sx + w - inset(e.right), sy + h);

      const top = mid - 4.5;
      text(
        page,
        bold,
        clip(bold, p.label || tr('Part {{n}}', { n: i + 1 }), 9.5, P.size - P.label - 90),
        P.label,
        top,
        9.5,
      );
      text(
        page,
        regular,
        `${formatLength(p.length!)} × ${formatLength(p.width!)}`,
        P.size,
        top,
        9.5,
        INK,
        'right',
      );
      text(page, bold, `×${formatNumber(p.qty!)}`, P.qty, top, 9.5, INK, 'right');
      text(
        page,
        regular,
        p.grain === 'none' ? tr('any') : p.grain === 'length' ? tr('length') : tr('width'),
        P.grain,
        top,
        9.5,
        INK_2,
      );
      const banded = [e.top, e.bottom, e.left, e.right].filter(Boolean).length;
      if (banded > 0) {
        const each =
          (Number(e.top) + Number(e.bottom)) * p.length! +
          (Number(e.left) + Number(e.right)) * p.width! +
          banded * allowance;
        text(page, regular, formatLong(each * p.qty!), right, mid - 9, 9.5, INK, 'right');
        text(
          page,
          regular,
          tr('n_edges_each', { count: banded }),
          right,
          mid + 2,
          8,
          INK_3,
          'right',
        );
      } else {
        text(page, regular, '—', right, top, 9.5, INK_3, 'right');
      }
      y += ROW;
      rule(page, y, M, right);
    }
  }
}
