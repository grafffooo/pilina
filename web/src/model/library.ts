// Materials, edge bands and app settings: shared by all projects, stored on this device.
import type { Unit } from '../lib/units';
import type {
  CutOrder,
  Grain,
  LinearPriceInput,
  LinearStockPrice,
  LinearStockSpec,
  PriceInput,
  StockPrice,
  StockSpec,
} from '../engine/types';
import type { MeasureFrom } from './cutMeasure';
import type { LabelFormat } from './offcut';
import { locale as current, t } from '../i18n';
import { newId, type Project } from './project';

export type MaterialKind = 'sheet' | 'linear';

export type PriceUnit = 'sheet' | 'sqm' | 'piece' | 'metre';

export interface Material {
  id: string;
  name: string;
  /** Sheet material (2D panel) vs linear stock (1D bar/profile). Missing on older records means 'sheet'. */
  kind?: MaterialKind;
  /** mm — board thickness, or profile thickness for linear stock. */
  thickness: number | null;
  /** Profile width (mm) for linear stock, e.g. 95 in 45x95 KVH. */
  profileWidth?: number | null;
  /** Reference stock bar length (mm) a per-piece linear price refers to. */
  stockLength?: number | null;
  /** Swatch colour for lists and the drawing legend. */
  color: string;
  price: number | null;
  priceUnit: PriceUnit;
  /** Sheet size a per-sheet price refers to (mm). Other sizes are priced by area. */
  sheetLength: number | null;
  sheetWidth: number | null;
  /**
   * Which way the board's grain runs: along the sheet's length, along its width, or 'none'
   * (MDF, chipboard without décor…), where parts may rotate freely. Missing on materials
   * saved before grain existed, which means 'length'.
   */
  grain?: Grain;
}

/** Whether a material is a sheet board or linear stock, defaulting older records to 'sheet'. */
export function materialKind(m: Pick<Material, 'kind'> | undefined | null): MaterialKind {
  return m?.kind ?? 'sheet';
}

/** A material's grain, with the default for materials saved before grain existed. */
export function materialGrain(m: Pick<Material, 'grain'> | undefined | null): Grain {
  return m?.grain ?? 'length';
}

export interface EdgeBand {
  id: string;
  name: string;
  pricePerMetre: number | null;
}

export type TransportKind = 'trunk' | 'passthrough' | 'trailer' | 'custom';

export interface TransportProfile {
  id: string;
  name: string;
  kind: TransportKind;
  /** Maximum sheet/panel length (mm) that fits in this vehicle. */
  maxLength: number;
  /** Maximum sheet/panel width (mm) that fits in this vehicle. */
  maxWidth: number;
  /** Maximum 1D bar length (mm); defaults to maxLength when omitted. */
  maxBarLength?: number | null;
}

export const DEFAULT_TRANSPORT_PROFILES: TransportProfile[] = [
  { id: 'car-trunk', name: 'Car trunk', kind: 'trunk', maxLength: 1000, maxWidth: 900 },
  {
    id: 'car-passthrough',
    name: 'Car + pass-through',
    kind: 'passthrough',
    maxLength: 2200,
    maxWidth: 450,
    maxBarLength: 2400,
  },
  { id: 'trailer', name: 'Trailer', kind: 'trailer', maxLength: 2500, maxWidth: 1250 },
];

export interface Settings {
  currency: string;
  /** Unit sizes are typed and shown in; data stays in millimetres. */
  units: Unit;
  /** Cut positions: from the edge of the piece being cut (the last cut), or the sheet's edge. */
  cutMeasure: MeasureFrom;
  /** Sawing order: all rips first (track saw, then mitre saw) or strip by strip (panel saw). */
  cutOrder: CutOrder;
  /** Extra band length per banded edge, mm. */
  edgeAllowance: number;
  /** Leftovers at least this big count as reusable offcuts (mm). */
  offcutMinLength: number;
  offcutMinWidth: number;
  /** Linear bar leftovers at least this long count as reusable linear offcuts (mm). */
  linearOffcutMinLength: number;
  /** Number for the next offcut ID (OC-0001, OC-0002, …). */
  nextOffcutNumber: number;
  /** Storage places offered when keeping an offcut. */
  locations: string[];
  labelFormatId: string;
  /** The sticker sheet used when `labelFormatId` is "custom" (mm). */
  customLabel: LabelFormat | null;
  /** First free sticker on the partly used label sheet (1-based). */
  labelStart: number;
  labelShow: { material: boolean; location: boolean; source: boolean };
  /** Saved vehicle cargo limits for store pre-cuts. */
  transportProfiles?: TransportProfile[];
  /** Store panel-saw kerf (mm) used for transport breakdown cuts. */
  storeKerf?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  units: 'mm',
  cutMeasure: 'piece',
  cutOrder: 'ripsFirst',
  edgeAllowance: 20,
  offcutMinLength: 300,
  offcutMinWidth: 100,
  linearOffcutMinLength: 300,
  nextOffcutNumber: 1,
  locations: ['Rack A', 'Rack B', 'Bin 1'],
  labelFormatId: 'a4-3x8',
  customLabel: null,
  labelStart: 1,
  labelShow: { material: true, location: true, source: true },
  transportProfiles: DEFAULT_TRANSPORT_PROFILES,
  storeKerf: 4.5,
};

export const CURRENCIES = ['EUR', 'CZK', 'USD', 'GBP', 'PLN', 'HUF', 'CHF'];

const MATERIAL_COLORS = [
  '#2B2B2B',
  '#C8A27A',
  '#E9E4DA',
  '#8A6A4F',
  '#B7C4CF',
  '#6E7F5E',
  '#D9CBB2',
];

export function newMaterial(name: string, index = 0): Material {
  return {
    id: newId(),
    name,
    kind: 'sheet',
    thickness: guessThickness(name),
    profileWidth: null,
    stockLength: null,
    color: MATERIAL_COLORS[index % MATERIAL_COLORS.length]!,
    price: null,
    priceUnit: 'sheet',
    sheetLength: null,
    sheetWidth: null,
    grain: 'length',
  };
}

export function newLinearMaterial(name: string, index = 0): Material {
  const { thickness, profileWidth } = guessProfile(name);
  return {
    id: newId(),
    name,
    kind: 'linear',
    thickness,
    profileWidth,
    stockLength: null,
    color: MATERIAL_COLORS[index % MATERIAL_COLORS.length]!,
    price: null,
    priceUnit: 'piece',
    sheetLength: null,
    sheetWidth: null,
    grain: 'length',
  };
}

export function newEdgeBand(name = 'ABS 2 mm'): EdgeBand {
  return { id: newId(), name, pricePerMetre: null };
}

/** "DTD Black 18mm" → 18. */
export function guessThickness(name: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*mm/i.exec(name);
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

/** "KVH 45x95" → { thickness: 45, profileWidth: 95 }; "Dowel 18mm" → { thickness: 18, profileWidth: null }. */
export function guessProfile(name: string): {
  thickness: number | null;
  profileWidth: number | null;
} {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i.exec(name);
  if (m) {
    return {
      thickness: Number(m[1]!.replace(',', '.')),
      profileWidth: Number(m[2]!.replace(',', '.')),
    };
  }
  return { thickness: guessThickness(name), profileWidth: null };
}

/**
 * Prices for one stock sheet. A per-sheet price applies as is when the sheet matches the
 * material's reference size (or none is set); other sizes, like offcuts, are priced by area.
 */
export function stockPrice(
  stockId: string,
  length: number,
  width: number,
  material: Material | undefined,
): StockPrice {
  const name = material?.name || t('Unnamed material');
  if (!material || material.price === null) return { stockId, material: name };
  if (material.priceUnit === 'sqm') return { stockId, material: name, perSqm: material.price };
  const refL = material.sheetLength;
  const refW = material.sheetWidth;
  const sameSize =
    refL === null ||
    refW === null ||
    (refL === length && refW === width) ||
    (refL === width && refW === length);
  if (sameSize) return { stockId, material: name, perSheet: material.price };
  return { stockId, material: name, perSqm: material.price / ((refL * refW) / 1e6) };
}

/** Everything the core needs to price the open project. */
export function buildPriceInput(
  project: Project,
  materials: Material[],
  bands: EdgeBand[],
  settings: Settings,
  offcutStock: StockSpec[] = [],
  preCuts: { material?: string | null; pieces: { stockId: string; length: number; width: number }[] }[] = [],
): PriceInput {
  const mat = new Map(materials.map((m) => [m.id, m]));
  const band = new Map(bands.map((b) => [b.id, b]));
  return {
    mode: project.pricing.mode,
    wastePct: project.pricing.wastePct,
    offcutCredit: project.pricing.offcutCredit,
    offcutRule: { minLength: settings.offcutMinLength, minWidth: settings.offcutMinWidth },
    stock: [
      ...project.stock
        .filter((s) => s.length && s.width)
        .map((s) =>
          stockPrice(s.id, s.length!, s.width!, s.materialId ? mat.get(s.materialId) : undefined),
        ),
      ...materials
        .filter((m) => materialKind(m) === 'sheet' && m.sheetLength && m.sheetWidth)
        .map((m) => stockPrice(`mat:${m.id}`, m.sheetLength!, m.sheetWidth!, m)),
      ...preCuts.flatMap((pc) => {
        const m = pc.material ? mat.get(pc.material) : undefined;
        return pc.pieces.map((p) => stockPrice(p.stockId, p.length, p.width, m));
      }),
      // Library offcuts are free (paid for earlier) but grouped under their material.
      ...offcutStock.map((s) => ({
        stockId: s.id,
        material: (s.material && mat.get(s.material)?.name) || t('Unnamed material'),
      })),
    ],
    edgeBands: project.parts.map((p) => {
      const b = band.get(p.edgeBandId ?? project.defaultEdgeBandId ?? '');
      return { partId: p.id, band: b?.name ?? t('Edge band'), perMetre: b?.pricePerMetre ?? null };
    }),
    edgeAllowance: settings.edgeAllowance,
    extras: project.pricing.extras
      .filter((x) => x.amount !== null && Number.isFinite(x.amount))
      .map((x) => ({ label: x.label, amount: x.amount! * (x.qty ?? 1) })),
  };
}

/**
 * Projects saved before materials existed named their stock with free text. Turns each
 * distinct name into a material (reusing existing ones by name) and links the rows.
 */
export function linkLegacyStockLabels(
  rawProjects: {
    stock?: {
      label?: string;
      materialId?: string | null;
      length?: number | null;
      width?: number | null;
    }[];
  }[],
  materials: Material[],
): Material[] {
  const created: Material[] = [];
  const byName = new Map(materials.map((m) => [m.name.trim().toLowerCase(), m]));
  for (const p of rawProjects) {
    for (const s of p.stock ?? []) {
      const label = s.label?.trim();
      if (s.materialId || !label) continue;
      let m = byName.get(label.toLowerCase());
      if (!m) {
        m = newMaterial(label, materials.length + created.length);
        m.sheetLength = s.length ?? null;
        m.sheetWidth = s.width ?? null;
        created.push(m);
        byName.set(label.toLowerCase(), m);
      }
      s.materialId = m.id;
    }
  }
  return created;
}

export function formatMoney(amount: number, currency: string, locale: string = current()): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** A material's price per m² (from either unit), or `null` when unpriced. */
export function pricePerSqm(m: Material | undefined): number | null {
  if (!m || m.price === null) return null;
  if (m.priceUnit === 'sqm') return m.price;
  if (m.priceUnit !== 'sheet' || !m.sheetLength || !m.sheetWidth) return null;
  return m.price / ((m.sheetLength * m.sheetWidth) / 1e6);
}

/** A linear material's price per metre (from either unit), or `null` when unpriced. */
export function pricePerMetre(m: Material | undefined): number | null {
  if (!m || m.price === null) return null;
  if (m.priceUnit === 'metre') return m.price;
  if (m.priceUnit !== 'piece' || !m.stockLength || m.stockLength <= 0) return null;
  return m.price / (m.stockLength / 1000);
}

/**
 * Prices for one linear stock bar. A per-piece price applies as is when the bar matches the
 * material's reference length (or none is set); other lengths are priced per metre.
 */
export function linearStockPrice(
  stockId: string,
  length: number,
  material: Material | undefined,
): LinearStockPrice {
  const name = material?.name || t('Unnamed material');
  if (!material || material.price === null) return { stockId, material: name };
  if (material.priceUnit === 'metre') return { stockId, material: name, perMetre: material.price };
  if (material.priceUnit === 'piece') {
    const refL = material.stockLength ?? null;
    if (refL === null || refL === length) return { stockId, material: name, perPiece: material.price };
    if (refL > 0) return { stockId, material: name, perMetre: material.price / (refL / 1000) };
  }
  return { stockId, material: name };
}

/** Everything the core needs to price linear (1D) stock in the open project. */
export function buildLinearPriceInput(
  project: Project,
  materials: Material[],
  settings: Settings,
  offcutStock: LinearStockSpec[] = [],
  includeExtras = false,
  preCuts: { sourceStockId: string; material?: string | null; pieceLengths: number[] }[] = [],
): LinearPriceInput {
  const mat = new Map(materials.map((m) => [m.id, m]));
  return {
    mode: project.pricing.mode === 'area' ? 'length' : 'pieces',
    wastePct: project.pricing.wastePct,
    offcutCredit: project.pricing.offcutCredit,
    minOffcutLength: settings.linearOffcutMinLength ?? 300,
    stock: [
      ...(project.linearStock ?? [])
        .filter((s) => s.length)
        .map((s) =>
          linearStockPrice(s.id, s.length!, s.materialId ? mat.get(s.materialId) : undefined),
        ),
      ...materials
        .filter((m) => materialKind(m) === 'linear' && m.stockLength)
        .map((m) => linearStockPrice(`mat:${m.id}`, m.stockLength!, m)),
      ...preCuts.flatMap((pc) => {
        const m = pc.material ? mat.get(pc.material) : undefined;
        return pc.pieceLengths.map((len, i) =>
          linearStockPrice(`precut:${pc.sourceStockId}:${i + 1}`, len, m),
        );
      }),
      // Library offcuts are free (paid for earlier) but grouped under their material.
      ...offcutStock.map((s) => ({
        stockId: s.id,
        material: (s.material && mat.get(s.material)?.name) || t('Unnamed material'),
      })),
    ],
    extras: includeExtras
      ? project.pricing.extras
          .filter((x) => x.amount !== null && Number.isFinite(x.amount))
          .map((x) => ({ label: x.label, amount: x.amount! * (x.qty ?? 1) }))
      : [],
  };
}
