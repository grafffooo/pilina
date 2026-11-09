// The project as stored on this device. Sizes are millimetres; `null` means "not entered yet".
import type { Edges, Grain } from '../engine/types';

export const SCHEMA_VERSION = 1;

export interface PartRow {
  id: string;
  length: number | null;
  width: number | null;
  qty: number | null;
  label: string;
  grain: Grain;
  edges: Edges;
  enabled: boolean;
}

export interface StockRow {
  id: string;
  length: number | null;
  width: number | null;
  /** `null` = unlimited */
  qty: number | null;
  /** Material name shown to the user, e.g. "DTD Black 18mm". */
  label: string;
  priority: boolean;
  enabled: boolean;
}

/** Last optimizer result, kept for the project list. */
export interface ProjectSummary {
  pieces: number;
  sheets: number;
  usedPct: number;
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
  };
}

export function emptyStock(): StockRow {
  return {
    id: newId(),
    length: null,
    width: null,
    qty: null,
    label: '',
    priority: false,
    enabled: true,
  };
}

/** A fresh project: one empty part row and a common 2800 × 2070 board. */
export function newProject(name = 'Untitled project', now = Date.now()): Project {
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
        label: 'Chipboard 18mm',
        priority: true,
      },
    ],
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
    stock: (stored.stock ?? base.stock).map((s) => ({ ...emptyStock(), ...s })),
    summary: stored.summary ?? null,
  };
}
