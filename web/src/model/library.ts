// Materials, edge bands and app settings: shared by all projects, stored on this device.
import type { Grain, PriceInput, StockPrice, StockSpec } from '../engine/types';
import { locale as current, t } from '../i18n';
import { newId, type Project } from './project';

export type PriceUnit = 'sheet' | 'sqm';

export interface Material {
  id: string;
  name: string;
  /** mm */
  thickness: number | null;
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

/** A material's grain, with the default for materials saved before grain existed. */
export function materialGrain(m: Pick<Material, 'grain'> | undefined | null): Grain {
  return m?.grain ?? 'length';
}

export interface EdgeBand {
  id: string;
  name: string;
  pricePerMetre: number | null;
}

export interface Settings {
  currency: string;
  /** Extra band length per banded edge, mm. */
  edgeAllowance: number;
  /** Leftovers at least this big count as reusable offcuts (mm). */
  offcutMinLength: number;
  offcutMinWidth: number;
  /** Number for the next offcut ID (OC-0001, OC-0002, …). */
  nextOffcutNumber: number;
  /** Storage places offered when keeping an offcut. */
  locations: string[];
  labelFormatId: string;
  /** First free sticker on the partly used label sheet (1-based). */
  labelStart: number;
  labelShow: { material: boolean; location: boolean; source: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  edgeAllowance: 20,
  offcutMinLength: 300,
  offcutMinWidth: 100,
  nextOffcutNumber: 1,
  locations: ['Rack A', 'Rack B', 'Bin 1'],
  labelFormatId: 'a4-3x8',
  labelStart: 1,
  labelShow: { material: true, location: true, source: true },
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
    thickness: guessThickness(name),
    color: MATERIAL_COLORS[index % MATERIAL_COLORS.length]!,
    price: null,
    priceUnit: 'sheet',
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
  if (!m.sheetLength || !m.sheetWidth) return null;
  return m.price / ((m.sheetLength * m.sheetWidth) / 1e6);
}
