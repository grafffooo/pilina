// TypeScript mirror of crates/cutlist-core/src/model.rs (JSON uses camelCase).
// Keep in sync by hand for now; generating these from Rust is planned for milestone 1.

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
  priority?: boolean;
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
  stage: 1 | 2 | 3 | 4;
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
  sheets: number;
  sheetArea: number;
  usedArea: number;
  wasteArea: number;
  cuts: number;
  cutLength: number;
  edgeBandLength: number;
}

export interface Plan {
  sheets: SheetLayout[];
  unplaced: Unplaced[];
  totals: Totals;
}
