import { useMemo } from 'react';
import type { Edges } from '../engine/types';
import { swatch } from '../model/describe';
import type { Project } from '../model/project';

export interface PartInfo {
  label: string;
  color: string;
  length: number;
  width: number;
  edges: Edges;
}

export interface LinearPartInfo {
  label: string;
  color: string;
  length: number;
}

/** Looks up a placement's part row (label, colour, size) by part id. */
export function usePartInfo(project: Project): Map<string, PartInfo> {
  const parts = project.parts;
  return useMemo(
    () =>
      new Map(
        parts.map((p, i) => [
          p.id,
          {
            label: p.label || `Part ${i + 1}`,
            color: swatch(i),
            length: p.length ?? 0,
            width: p.width ?? 0,
            edges: p.edges,
          },
        ]),
      ),
    [parts],
  );
}

/** Looks up a linear placement's part row (label, colour, length) by part id. */
export function useLinearPartInfo(project: Project): Map<string, LinearPartInfo> {
  const parts = project.linearParts;
  return useMemo(
    () =>
      new Map(
        parts.map((p, i) => [
          p.id,
          {
            label: p.label || `Part ${i + 1}`,
            color: swatch(i),
            length: p.length ?? 0,
          },
        ]),
      ),
    [parts],
  );
}
