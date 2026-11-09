// The project as stored on this device. Sizes are millimetres; `null` means "not entered yet".
import type { Edges, Grain } from '../engine/types';

export const SCHEMA_VERSION = 3;

export interface PartRow {
  id: string;
  length: number | null;
  width: number | null;
  qty: number | null;
  label: string;
  grain: Grain;
  edges: Edges;
  enabled: boolean;
  /** Board the part is cut from; `null` = any stock sheet. */
  materialId: string | null;
  /** Edge band for this part; `null` = the project's default band. */
  edgeBandId: string | null;
}

export interface StockRow {
  id: string;
  length: number | null;
  width: number | null;
  /** `null` = unlimited */
  qty: number | null;
  materialId: string | null;
  priority: boolean;
  enabled: boolean;
}

/** Last optimizer result, kept for the project list. */
export interface ProjectSummary {
  pieces: number;
  sheets: number;
  usedPct: number;
  /** Total cost when every price is known. */
  cost?: number | null;
}

export interface ExtraLine {
  id: string;
  label: string;
  /** Price per piece. */
  amount: number | null;
  qty: number | null;
}

export interface ProjectPricing {
  mode: 'sheets' | 'area';
  /** Area mode: material added on top of the parts' area, percent. */
  wastePct: number;
  /** Sheets mode: credit reusable leftovers back. */
  offcutCredit: boolean;
  extras: ExtraLine[];
}

export interface Project {
  schema: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  kerf: number;
  trim: number;
  parts: PartRow[];
  stock: StockRow[];
  pricing: ProjectPricing;
  defaultEdgeBandId: string | null;
  /** Use matching offcuts from the library before full sheets. */
  useOffcuts: boolean;
  /** When the last sheet was marked as cut in cut mode. */
  cutAt: number | null;
  summary: ProjectSummary | null;
}

export const NO_EDGES: Edges = { top: false, bottom: false, left: false, right: false };
export const ALL_EDGES: Edges = { top: true, bottom: true, left: true, right: true };

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyPart(): PartRow {
  return {
    id: newId(),
    length: null,
    width: null,
    qty: 1,
    label: '',
    grain: 'none',
    edges: { ...NO_EDGES },
    enabled: true,
    materialId: null,
    edgeBandId: null,
  };
}

export function emptyExtra(): ExtraLine {
  return { id: newId(), label: '', amount: null, qty: 1 };
}

export function emptyStock(): StockRow {
  return {
    id: newId(),
    length: null,
    width: null,
    qty: null,
    materialId: null,
    priority: false,
    enabled: true,
  };
}

export const DEFAULT_PRICING: ProjectPricing = {
  mode: 'sheets',
  wastePct: 10,
  offcutCredit: false,
  extras: [],
};

/** A fresh project: one empty part row and a common 2800 × 2070 board. */
export function newProject(
  name = 'Untitled project',
  now = Date.now(),
  materialId: string | null = null,
): Project {
  return {
    schema: SCHEMA_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    kerf: 4,
    trim: 0,
    parts: [emptyPart()],
    stock: [
      {
        ...emptyStock(),
        length: 2800,
        width: 2070,
        materialId,
        priority: true,
      },
    ],
    pricing: { ...DEFAULT_PRICING, extras: [] },
    defaultEdgeBandId: null,
    useOffcuts: true,
    cutAt: null,
    summary: null,
  };
}

/** True when the row has nothing typed in (the placeholder row at the end). */
export function isBlankPart(p: PartRow): boolean {
  return p.length === null && p.width === null && p.label.trim() === '';
}

/** Number of pieces the optimizer will receive. */
export function countPieces(project: Project): number {
  return project.parts.reduce(
    (n, p) => n + (p.enabled && p.length && p.width && p.qty ? p.qty : 0),
    0,
  );
}

/** Brings a stored project up to the current schema. */
export function migrate(stored: Partial<Project> & { id: string }): Project {
  const base = newProject(stored.name ?? 'Untitled project', stored.createdAt ?? Date.now());
  return {
    ...base,
    ...stored,
    schema: SCHEMA_VERSION,
    parts: (stored.parts ?? base.parts).map((p) => ({ ...emptyPart(), ...p })),
    stock: (stored.stock ?? base.stock).map((s) => {
      // Schema 1 named stock with free text; `linkLegacyStockLabels` turns it into a material.
      const { label: _legacy, ...rest } = s as StockRow & { label?: string };
      return { ...emptyStock(), ...rest };
    }),
    pricing: { ...DEFAULT_PRICING, ...stored.pricing, extras: stored.pricing?.extras ?? [] },
    defaultEdgeBandId: stored.defaultEdgeBandId ?? null,
    useOffcuts: stored.useOffcuts ?? true,
    cutAt: stored.cutAt ?? null,
    summary: stored.summary ?? null,
  };
}
