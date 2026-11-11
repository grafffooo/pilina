// Edge banding per part: top/bottom are the long (length) edges, left/right the short ones.
import type { Edges } from '../engine/types';
import { ALL_EDGES, NO_EDGES } from '../model/project';
import { useCurrentProject, useStore } from '../store/store';
import type { ReactNode } from 'react';
import { Popover } from '../ui/Popover';
import { useMediaQuery } from '../ui/hooks';
import { EdgeEditor } from './EdgeEditor';
import { t as i18nT } from '../i18n';
import styles from './Editor.module.css';
import { useTranslation } from 'react-i18next';

const SIDES: { key: keyof Edges; label: () => string }[] = [
  { key: 'top', label: () => i18nT('Long edge 1') },
  { key: 'bottom', label: () => i18nT('Long edge 2') },
  { key: 'left', label: () => i18nT('Short edge 1') },
  { key: 'right', label: () => i18nT('Short edge 2') },
];

export function describeEdges(e: Edges): string {
  const n = [e.top, e.bottom, e.left, e.right].filter(Boolean).length;
  if (n === 0) return i18nT('none');
  if (n === 4) return i18nT('all 4 edges');
  const long = [e.top, e.bottom].filter(Boolean).length;
  const short = n - long;
  return [long && i18nT('{{n}} long', { n: long }), short && i18nT('{{n}} short', { n: short })]
    .filter(Boolean)
    .join(', ');
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
  bandId,
  onChange,
  onBandChange,
  triggerClassName,
  trigger,
}: {
  triggerClassName?: string;
  /** What the trigger button shows (default: the edge glyph). */
  trigger?: ReactNode;
  edges: Edges;
  partName: string;
  /** This part's band; `null` = the project's default. */
  bandId: string | null;
  onChange: (e: Edges) => void;
  onBandChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const bands = useStore((s) => s.edgeBands);
  const defaultId = useCurrentProject()?.defaultEdgeBandId ?? null;
  const defaultName = bands.find((b) => b.id === defaultId)?.name;
  const phone = useMediaQuery('(max-width: 767px)');
  return (
    <Popover
      title={t('Edge banding')}
      triggerClassName={triggerClassName ?? styles.edgeButton}
      ariaLabel={t('Edge banding for {{name}}: {{edges}}', {
        name: partName,
        edges: describeEdges(edges),
      })}
      label={trigger ?? <EdgeGlyph edges={edges} />}
      align="end"
    >
      {(close) =>
        phone ? (
          <EdgeEditor
            edges={edges}
            bandId={bandId}
            onChange={onChange}
            onBandChange={onBandChange}
            close={close}
          />
        ) : (
          <fieldset className={styles.edgePanel}>
            <legend>{t('Edge banding')}</legend>
            {SIDES.map((s) => (
              <label key={s.key} className={styles.edgeOption}>
                <input
                  type="checkbox"
                  checked={edges[s.key]}
                  onChange={(e) => onChange({ ...edges, [s.key]: e.target.checked })}
                />
                {s.label()}
              </label>
            ))}
            <div className={styles.edgeQuick}>
              <button type="button" onClick={() => onChange({ ...ALL_EDGES })}>
                {t('All')}
              </button>
              <button type="button" onClick={() => onChange({ ...NO_EDGES })}>
                {t('None')}
              </button>
            </div>
            {bands.length > 0 && (
              <label className={styles.edgeBand}>
                {t('Band')}
                <select
                  className={styles.select}
                  value={bandId ?? ''}
                  onChange={(e) => onBandChange(e.target.value || null)}
                >
                  <option value="">
                    {defaultName
                      ? t('Project default ({{name}})', { name: defaultName })
                      : t('Project default')}
                  </option>
                  {bands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
        )
      }
    </Popover>
  );
}
