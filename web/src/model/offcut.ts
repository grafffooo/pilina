// Offcut library: leftovers kept for later, each with an OC-0001 style ID and a QR label.
import type { Grain, LinearStockSpec, Rect, StockSpec } from '../engine/types';
import { materialGrain, type Material, type Settings } from './library';
import { newId, type Project } from './project';

export type OffcutKind = 'sheet' | 'linear';
export type OffcutStatus = 'available' | 'reserved' | 'used';
/** `queued` = waiting for the next label sheet. */
export type LabelState = 'queued' | 'printed' | 'none';

export interface Offcut {
  id: string;
  /** Human ID printed on the label and held in its QR code, e.g. "OC-0013". */
  code: string;
  /** Sheet rectangle vs linear bar leftover. Missing on older records means 'sheet'. */
  kind?: OffcutKind;
  materialId: string | null;
  /** mm, always length ≥ width for sheet offcuts; bar length for linear offcuts. */
  length: number;
  /** mm (0 for linear offcuts). */
  width: number;
  /** Optional profile dimensions in mm for linear offcuts without a linked material. */
  profileThickness?: number | null;
  profileWidth?: number | null;
  /**
   * Which way the grain runs on this piece: along its length or its width ('none' for boards
   * without grain). Missing on offcuts kept before grain existed, which means 'length'.
   */
  grain?: Grain;
  location: string;
  status: OffcutStatus;
  label: LabelState;
  /** Where it came from: a project's cut, or added by hand. */
  sourceProjectId: string | null;
  sourceProjectName: string | null;
  createdAt: number;
  /** Last change, for syncing (missing on offcuts not changed since this was added). */
  updatedAt?: number;
  /** Set when a project cut it. */
  usedInProjectName: string | null;
  usedAt: number | null;
}

/** Whether an offcut is a sheet piece or linear bar, defaulting legacy records to 'sheet'. */
export function offcutKind(o: Pick<Offcut, 'kind'> | undefined | null): OffcutKind {
  return o?.kind ?? 'sheet';
}

/** "OC-0007" (four digits, more when needed). */
export function offcutCode(n: number): string {
  return `OC-${String(n).padStart(4, '0')}`;
}

export function newOffcut(
  number: number,
  size: { length: number; width: number },
  fields: Partial<Offcut> = {},
  now = Date.now(),
): Offcut {
  const long = Math.max(size.length, size.width);
  const short = Math.min(size.length, size.width);
  return {
    id: newId(),
    code: offcutCode(number),
    kind: 'sheet',
    materialId: null,
    length: long,
    width: short,
    location: '',
    status: 'available',
    label: 'queued',
    sourceProjectId: null,
    sourceProjectName: null,
    createdAt: now,
    usedInProjectName: null,
    usedAt: null,
    ...fields,
  };
}

export function newLinearOffcut(
  number: number,
  length: number,
  fields: Partial<Offcut> = {},
  now = Date.now(),
): Offcut {
  return {
    id: newId(),
    code: offcutCode(number),
    kind: 'linear',
    materialId: null,
    length,
    width: 0,
    profileThickness: null,
    profileWidth: null,
    location: '',
    status: 'available',
    label: 'queued',
    sourceProjectId: null,
    sourceProjectName: null,
    createdAt: now,
    usedInProjectName: null,
    usedAt: null,
    ...fields,
  };
}

/** Engine stock id for a library offcut; lets results map a sheet back to its offcut. */
export const OFFCUT_STOCK_PREFIX = 'offcut:';

export function offcutIdFromStock(stockId: string): string | null {
  return stockId.startsWith(OFFCUT_STOCK_PREFIX) ? stockId.slice(OFFCUT_STOCK_PREFIX.length) : null;
}

/**
 * Available offcuts in a material the project cuts from (including material-less offcuts when
 * the project has enabled sized stock without a material), excluding the project's own leftovers.
 */
export function matchingOffcuts(project: Project, offcuts: Offcut[]): Offcut[] {
  const materials = new Set([
    ...project.parts.filter((p) => p.enabled && p.materialId).map((p) => p.materialId!),
    ...project.stock.filter((s) => s.enabled && s.materialId).map((s) => s.materialId!),
  ]);
  const hasUnassigned = project.stock.some(
    (s) => s.enabled && s.length !== null && s.length > 0 && s.width !== null && s.width > 0 && s.materialId === null,
  );
  return offcuts.filter(
    (o) =>
      offcutKind(o) === 'sheet' &&
      o.status === 'available' &&
      o.sourceProjectId !== project.id &&
      (o.materialId === null ? hasUnassigned : materials.has(o.materialId)),
  );
}

/**
 * Available linear offcuts in a material the project cuts from (including material-less linear
 * offcuts when the project has enabled sized linear stock without a material), excluding the
 * project's own leftovers.
 */
export function matchingLinearOffcuts(project: Project, offcuts: Offcut[]): Offcut[] {
  const linearStock = project.linearStock ?? [];
  const linearParts = project.linearParts ?? [];
  const materials = new Set([
    ...linearParts.filter((p) => p.enabled && p.materialId).map((p) => p.materialId!),
    ...linearStock.filter((s) => s.enabled && s.materialId).map((s) => s.materialId!),
  ]);
  const hasUnassigned = linearStock.some(
    (s) => s.enabled && s.length !== null && s.length > 0 && s.materialId === null,
  );
  return offcuts.filter(
    (o) =>
      offcutKind(o) === 'linear' &&
      o.status === 'available' &&
      o.sourceProjectId !== project.id &&
      (o.materialId === null ? hasUnassigned : materials.has(o.materialId)),
  );
}

/** Library offcuts as one-sheet engine stock, used before any full sheet. */
/**
 * The grain of a leftover cut from a sheet, relative to the offcut's own length (its longer
 * side). `rect` is in the sheet's frame: `w` across the sheet's width, `h` along its length.
 */
export function leftoverGrain(rect: Rect, sheetGrain: Grain): Grain {
  if (sheetGrain === 'none') return 'none';
  // Same tie-break as `newOffcut`: with equal sides, the offcut's length is `rect.w`.
  const longSide = rect.w >= rect.h ? 'width' : 'length';
  return longSide === sheetGrain ? 'length' : 'width';
}

export function offcutStock(offcuts: Offcut[], materials: Material[]): StockSpec[] {
  const names = new Map(materials.map((m) => [m.id, m.name]));
  const byId = new Map(materials.map((m) => [m.id, m]));
  return offcuts.map((o) => ({
    id: `${OFFCUT_STOCK_PREFIX}${o.id}`,
    length: o.length,
    width: o.width,
    qty: 1,
    offcut: true,
    material: o.materialId,
    label: `${o.code} · ${(o.materialId && names.get(o.materialId)) || 'offcut'}`,
    // A material without grain frees every offcut of it, whatever was recorded.
    grain:
      o.materialId && materialGrain(byId.get(o.materialId)) === 'none'
        ? 'none'
        : (o.grain ?? 'length'),
  }));
}

export function linearOffcutStock(offcuts: Offcut[], materials: Material[]): LinearStockSpec[] {
  const names = new Map(materials.map((m) => [m.id, m.name]));
  return offcuts.map((o) => ({
    id: `${OFFCUT_STOCK_PREFIX}${o.id}`,
    length: o.length,
    qty: 1,
    offcut: true,
    material: o.materialId,
    label: `${o.code} · ${(o.materialId && names.get(o.materialId)) || 'offcut'}`,
  }));
}

export type KeepAdvice = 'suggested' | 'strip' | 'small';
export type OffcutRule = Pick<Settings, 'offcutMinLength' | 'offcutMinWidth'>;
export const DEFAULT_OFFCUT_RULE: OffcutRule = { offcutMinLength: 300, offcutMinWidth: 100 };

/** Whether a leftover is worth keeping, by the library's minimum size. */
export function keepAdvice(r: Rect, settings: OffcutRule = DEFAULT_OFFCUT_RULE): KeepAdvice {
  const long = Math.max(r.w, r.h);
  const short = Math.min(r.w, r.h);
  if (long >= settings.offcutMinLength && short >= settings.offcutMinWidth) return 'suggested';
  if (long >= settings.offcutMinLength && short >= 30) return 'strip';
  return 'small';
}

export type LinearKeepAdvice = 'suggested' | 'small';
export const DEFAULT_LINEAR_OFFCUT_MIN = 300;

/** Whether a bar leftover is worth keeping, by the minimum length setting. */
export function linearKeepAdvice(
  length: number,
  minLength = DEFAULT_LINEAR_OFFCUT_MIN,
): LinearKeepAdvice {
  return length >= minLength ? 'suggested' : 'small';
}

// ---- A4 sticker sheets ----

export interface LabelFormat {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** mm */
  labelW: number;
  labelH: number;
  marginLeft: number;
  marginTop: number;
  gapX: number;
  gapY: number;
}

/** Common A4 sticker sheets (210 × 297 mm). */
export const LABEL_FORMATS: LabelFormat[] = [
  {
    id: 'a4-3x8',
    name: '3 × 8 · 70 × 37 mm',
    cols: 3,
    rows: 8,
    labelW: 70,
    labelH: 37,
    marginLeft: 0,
    marginTop: 0.5,
    gapX: 0,
    gapY: 0,
  },
  {
    id: 'a4-3x7',
    name: '3 × 7 · 70 × 42.3 mm',
    cols: 3,
    rows: 7,
    labelW: 70,
    labelH: 42.3,
    marginLeft: 0,
    marginTop: 0.45,
    gapX: 0,
    gapY: 0,
  },
  {
    id: 'a4-2x7',
    name: '2 × 7 · 99.1 × 38.1 mm',
    cols: 2,
    rows: 7,
    labelW: 99.1,
    labelH: 38.1,
    marginLeft: 4.65,
    marginTop: 15.15,
    gapX: 2.5,
    gapY: 0,
  },
];

export const CUSTOM_LABEL_ID = 'custom';

/** A starting point for a custom sticker sheet: the common 3 × 8. */
export const DEFAULT_CUSTOM_LABEL: LabelFormat = {
  ...LABEL_FORMATS[0]!,
  id: CUSTOM_LABEL_ID,
  name: '',
};

export function labelFormat(id: string, custom?: LabelFormat | null): LabelFormat {
  if (id === CUSTOM_LABEL_ID) return { ...(custom ?? DEFAULT_CUSTOM_LABEL), id: CUSTOM_LABEL_ID };
  return LABEL_FORMATS.find((f) => f.id === id) ?? LABEL_FORMATS[0]!;
}

export const A4 = { w: 210, h: 297 };

/** How far the stickers run past the A4 page, mm (0 when they fit). */
export function labelOverflow(f: LabelFormat): { x: number; y: number } {
  const w = f.marginLeft + f.cols * f.labelW + (f.cols - 1) * f.gapX;
  const h = f.marginTop + f.rows * f.labelH + (f.rows - 1) * f.gapY;
  return {
    x: Math.max(0, Math.round((w - A4.w) * 10) / 10),
    y: Math.max(0, Math.round((h - A4.h) * 10) / 10),
  };
}

/** Top-left corner of sticker `index` (0-based, row by row), in mm from the page corner. */
export function stickerPosition(f: LabelFormat, index: number): { x: number; y: number } {
  const col = index % f.cols;
  const row = Math.floor(index / f.cols);
  return {
    x: f.marginLeft + col * (f.labelW + f.gapX),
    y: f.marginTop + row * (f.labelH + f.gapY),
  };
}

/**
 * Lays labels out on sheets starting at sticker `start` (1-based) of the first sheet.
 * Returns pages of [sticker index, item] pairs, and the first free sticker afterwards.
 */
export function layoutLabels<T>(
  items: T[],
  f: LabelFormat,
  start: number,
): { pages: { index: number; item: T }[][]; nextStart: number } {
  const per = f.cols * f.rows;
  const pages: { index: number; item: T }[][] = [];
  let slot = Math.min(Math.max(1, start), per) - 1;
  let page: { index: number; item: T }[] = [];
  for (const item of items) {
    if (slot >= per) {
      pages.push(page);
      page = [];
      slot = 0;
    }
    page.push({ index: slot, item });
    slot++;
  }
  if (page.length > 0) pages.push(page);
  return { pages, nextStart: slot >= per ? 1 : slot + 1 };
}
