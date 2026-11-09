// Edge banding per part: top/bottom are the long (length) edges, left/right the short ones.
import type { Edges } from '../engine/types';
import { ALL_EDGES, NO_EDGES } from '../model/project';
import { Popover } from '../ui/Popover';
import styles from './Editor.module.css';

const SIDES: { key: keyof Edges; label: string }[] = [
  { key: 'top', label: 'Long edge 1' },
  { key: 'bottom', label: 'Long edge 2' },
  { key: 'left', label: 'Short edge 1' },
  { key: 'right', label: 'Short edge 2' },
];

export function describeEdges(e: Edges): string {
  const n = [e.top, e.bottom, e.left, e.right].filter(Boolean).length;
  if (n === 0) return 'none';
  if (n === 4) return 'all 4 edges';
  const long = [e.top, e.bottom].filter(Boolean).length;
  const short = n - long;
  return [long && `${long} long`, short && `${short} short`].filter(Boolean).join(', ');
}

/** Small part outline with the banded edges drawn thick in the accent colour. */
export function EdgeGlyph({ edges, size = 18 }: { edges: Edges; size?: number }) {
  const on = 'var(--accent)';
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="5" y="2" width="8" height="14" fill="var(--surface-2)" stroke="var(--border)" />
      {edges.top && <path d="M4.5 1.5v15" stroke={on} strokeWidth="2.2" />}
      {edges.bottom && <path d="M13.5 1.5v15" stroke={on} strokeWidth="2.2" />}
      {edges.left && <path d="M4 1.5h10" stroke={on} strokeWidth="2.2" />}
      {edges.right && <path d="M4 16.5h10" stroke={on} strokeWidth="2.2" />}
    </svg>
  );
}

export function EdgePicker({
  edges,
  partName,
  onChange,
}: {
  edges: Edges;
  partName: string;
  onChange: (e: Edges) => void;
}) {
  return (
    <Popover
      triggerClassName={styles.edgeButton}
      ariaLabel={`Edge banding for ${partName}: ${describeEdges(edges)}`}
      label={<EdgeGlyph edges={edges} />}
      align="end"
    >
      {() => (
        <fieldset className={styles.edgePanel}>
          <legend>Edge banding</legend>
          {SIDES.map((s) => (
            <label key={s.key} className={styles.edgeOption}>
              <input
                type="checkbox"
                checked={edges[s.key]}
                onChange={(e) => onChange({ ...edges, [s.key]: e.target.checked })}
              />
              {s.label}
            </label>
          ))}
          <div className={styles.edgeQuick}>
            <button type="button" onClick={() => onChange({ ...ALL_EDGES })}>
              All
            </button>
            <button type="button" onClick={() => onChange({ ...NO_EDGES })}>
              None
            </button>
          </div>
        </fieldset>
      )}
    </Popover>
  );
}
