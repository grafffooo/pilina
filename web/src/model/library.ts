// Materials, edge bands and app settings: shared by all projects, stored on this device.
import type { PriceInput, StockPrice } from '../engine/types';
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
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  edgeAllowance: 20,
  offcutMinLength: 300,
  offcutMinWidth: 100,
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
  const name = material?.name || 'Unnamed material';
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
): PriceInput {
  const mat = new Map(materials.map((m) => [m.id, m]));
  const band = new Map(bands.map((b) => [b.id, b]));
  return {
    mode: project.pricing.mode,
    wastePct: project.pricing.wastePct,
    offcutCredit: project.pricing.offcutCredit,
    offcutRule: { minLength: settings.offcutMinLength, minWidth: settings.offcutMinWidth },
    stock: project.stock
      .filter((s) => s.length && s.width)
      .map((s) =>
        stockPrice(s.id, s.length!, s.width!, s.materialId ? mat.get(s.materialId) : undefined),
      ),
    edgeBands: project.parts.map((p) => {
      const b = band.get(p.edgeBandId ?? project.defaultEdgeBandId ?? '');
      return { partId: p.id, band: b?.name ?? 'Edge band', perMetre: b?.pricePerMetre ?? null };
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

export function formatMoney(amount: number, currency: string, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
