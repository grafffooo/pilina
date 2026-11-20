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
  /** Which way the sheet's grain runs; 'none' lets every part rotate. Default 'length'. */
  grain?: Grain;
}

/** Sawing order of a sheet's cuts: every rip first, or each rip with its strip's cuts. */
export type CutOrder = 'ripsFirst' | 'stripByStrip';

export interface Options {
  timeBudgetMs: number;
  seed: number;
  /** Only renumbers the cuts; default 'ripsFirst'. */
  cutOrder?: CutOrder;
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
  /** 1-based strip the cut belongs to (a rip: the strip on its left/top); 0 for edge trims.
   *  Missing in plans from before cut orders. */
  strip?: number;
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
  /** The strips the rips make, in order (strip n is strips[n - 1]). */
  strips?: Rect[];
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

// ---- 1D linear stock (crates/pilina-core/src/linear.rs & pricing.rs) ----

export interface LinearPartSpec {
  id: string;
  length: number;
  qty: number;
  label?: string;
  material?: string | null;
}

export interface LinearStockSpec {
  id: string;
  length: number;
  /** null/undefined = unlimited */
  qty?: number | null;
  priority?: boolean;
  /** A library offcut: used first, skips end trim, and its length doesn't count as new material. */
  offcut?: boolean;
  material?: string | null;
  label?: string;
}

export interface LinearOptions {
  timeBudgetMs: number;
  seed: number;
}

export interface LinearJob {
  parts: LinearPartSpec[];
  stock: LinearStockSpec[];
  kerf: number;
  endTrim?: number;
  options?: LinearOptions;
}

export interface LinearPlacement {
  partId: string;
  instance: number;
  x: number;
  length: number;
}

export interface LinearCut {
  number: number;
  /** 0 rough-end trim, 1 cross cut */
  stage: 0 | 1;
  pos: number;
  fromLastEdge: number;
}

export interface BarLayout {
  stockId: string;
  length: number;
  qty: number;
  placements: LinearPlacement[];
  cuts: LinearCut[];
  waste: number;
  offcutStart: number;
}

export interface LinearTotals {
  bars: number;
  offcutsUsed: number;
  stockLength: number;
  usedLength: number;
  wasteLength: number;
  cuts: number;
}

export interface LinearPlan {
  bars: BarLayout[];
  unplaced: Unplaced[];
  totals: LinearTotals;
}

export type LinearPricingMode = 'pieces' | 'length';

export interface LinearStockPrice {
  stockId: string;
  material: string;
  perPiece?: number | null;
  perMetre?: number | null;
}

export interface LinearPriceInput {
  mode: LinearPricingMode;
  wastePct: number;
  offcutCredit: boolean;
  minOffcutLength: number;
  stock: LinearStockPrice[];
  extras: ExtraCost[];
}

export interface LinearMaterialCost {
  material: string;
  bars: number;
  stockLength: number;
  usedLength: number;
  creditLength: number;
  gross: number;
  credit: number;
  cost: number;
  priced: boolean;
}

export interface LinearCostBreakdown {
  materials: LinearMaterialCost[];
  extras: number;
  total: number;
  complete: boolean;
}
