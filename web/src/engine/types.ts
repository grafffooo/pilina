// TypeScript mirror of crates/pilina-core/src/model.rs (JSON uses camelCase).
// Keep in sync by hand (see `model.rs` for field docs).

export type Grain = 'none' | 'length' | 'width';

export interface Edges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface PartSpec {
  id: string;
  length: number;
  width: number;
  qty: number;
  label?: string;
  grain?: Grain;
  material?: string | null;
  edges?: Edges;
}

export interface StockSpec {
  id: string;
  length: number;
  width: number;
  /** null/undefined = unlimited */
  qty?: number | null;
  /** Used before non-priority stock. */
  priority?: boolean;
  /** A library offcut: used before any stock, its area doesn't count as new material. */
  offcut?: boolean;
  material?: string | null;
  label?: string;
}

export interface Options {
  timeBudgetMs: number;
  seed: number;
}

export interface Job {
  parts: PartSpec[];
  stock: StockSpec[];
  kerf: number;
  trim?: number;
  options?: Options;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  partId: string;
  instance: number;
  rect: Rect;
  rotated: boolean;
}

export interface Cut {
  number: number;
  /** 0 edge trim, 1 rip, 2 cross cut, 3 split a row, 4 trim a part to length */
  stage: 0 | 1 | 2 | 3 | 4;
  axis: 'x' | 'y';
  pos: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
}

export interface SheetLayout {
  stockId: string;
  width: number;
  length: number;
  qty: number;
  placements: Placement[];
  cuts: Cut[];
  waste: Rect[];
}

export interface Unplaced {
  partId: string;
  count: number;
}

export interface Totals {
  /** Sheets to cut, library offcuts included. */
  sheets: number;
  offcutsUsed: number;
  sheetArea: number;
  usedArea: number;
  wasteArea: number;
  cuts: number;
  cutLength: number;
  edgeBandLength: number;
}

/** Reported after each search pass. */
export interface Progress {
  passes: number;
  bestSheets: number;
  bestUnplaced: number;
  elapsedMs: number;
}

export interface Plan {
  sheets: SheetLayout[];
  unplaced: Unplaced[];
  totals: Totals;
}

// ---- Pricing (crates/pilina-core/src/pricing.rs) ----

export type PricingMode = 'sheets' | 'area';

export interface OffcutRule {
  minLength: number;
  minWidth: number;
}

export interface StockPrice {
  stockId: string;
  material: string;
  perSheet?: number | null;
  perSqm?: number | null;
}

export interface EdgeBandPrice {
  partId: string;
  band: string;
  perMetre?: number | null;
}

export interface ExtraCost {
  label: string;
  amount: number;
}

export interface PriceInput {
  mode: PricingMode;
  wastePct: number;
  offcutCredit: boolean;
  offcutRule: OffcutRule;
  stock: StockPrice[];
  edgeBands: EdgeBandPrice[];
  /** mm per banded edge */
  edgeAllowance: number;
  extras: ExtraCost[];
}

export interface MaterialCost {
  material: string;
  sheets: number;
  sheetArea: number;
  usedArea: number;
  creditArea: number;
  gross: number;
  credit: number;
  cost: number;
  priced: boolean;
}

export interface EdgeBandCost {
  band: string;
  /** mm */
  length: number;
  cost: number;
  priced: boolean;
}

export interface CostBreakdown {
  materials: MaterialCost[];
  edgeBands: EdgeBandCost[];
  extras: number;
  total: number;
  complete: boolean;
}
