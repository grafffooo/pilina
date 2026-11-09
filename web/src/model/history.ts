// Undo/redo of whole-project snapshots. Rapid edits of the same field merge into one step.

export interface History<T> {
  past: T[];
  future: T[];
  /** Field key and time of the last recorded edit, for merging typing into one step. */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const MERGE_WINDOW_MS = 1200;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastKey: null, lastAt: 0 };
}

/** Records `before` as an undo step unless this edit continues the previous one. */
export function record<T>(h: History<T>, before: T, key: string | null, now: number): History<T> {
  const merge = key !== null && key === h.lastKey && now - h.lastAt < MERGE_WINDOW_MS;
  return {
    past: merge ? h.past : [...h.past, before].slice(-HISTORY_LIMIT),
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return null;
  return {
    history: {
      past: h.past.slice(0, -1),
      future: [current, ...h.future],
      lastKey: null,
      lastAt: 0,
    },
    value: prev,
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  const next = h.future[0];
  if (next === undefined) return null;
  return {
    history: { past: [...h.past, current], future: h.future.slice(1), lastKey: null, lastAt: 0 },
    value: next,
  };
}
