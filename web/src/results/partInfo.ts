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
