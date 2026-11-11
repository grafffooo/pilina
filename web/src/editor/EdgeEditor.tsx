// Edge banding in a bottom sheet: a part drawn with its four edges as big tap targets, quick
// choices (None, All) and the band to use.
import type { Edges } from '../engine/types';
import { useTranslation } from 'react-i18next';
import { ALL_EDGES, NO_EDGES } from '../model/project';
import { useCurrentProject, useStore } from '../store/store';
import { t as i18nT } from '../i18n';
import styles from './EdgeEditor.module.css';

const SIDES: { key: keyof Edges; label: () => string }[] = [
  { key: 'top', label: () => i18nT('Long edge 1') },
  { key: 'bottom', label: () => i18nT('Long edge 2') },
  { key: 'left', label: () => i18nT('Short edge 1') },
  { key: 'right', label: () => i18nT('Short edge 2') },
];

export function EdgeEditor({
  edges,
  bandId,
  onChange,
  onBandChange,
  close,
}: {
  edges: Edges;
  /** This part's band; `null` = the project's default. */
  bandId: string | null;
  onChange: (e: Edges) => void;
  onBandChange: (id: string | null) => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  const bands = useStore((s) => s.edgeBands);
  const defaultId = useCurrentProject()?.defaultEdgeBandId ?? null;
  const defaultName = bands.find((b) => b.id === defaultId)?.name;
  const all = SIDES.every((s) => edges[s.key]);
  const none = SIDES.every((s) => !edges[s.key]);

  return (
    <>
      <div className={styles.drawing}>
        <div className={styles.part} aria-hidden="true" />
        {SIDES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`${styles.edge} ${styles[s.key]}`}
            aria-pressed={edges[s.key]}
            onClick={() => onChange({ ...edges, [s.key]: !edges[s.key] })}
          >
            <span className={styles.label}>
              {edges[s.key] ? '✓ ' : ''}
              {s.label()}
            </span>
            <span className={styles.bar} />
          </button>
        ))}
      </div>
      <div className={styles.presets}>
        <button type="button" aria-pressed={none} onClick={() => onChange({ ...NO_EDGES })}>
          {t('None')}
        </button>
        <button type="button" aria-pressed={all} onClick={() => onChange({ ...ALL_EDGES })}>
          {t('All')}
        </button>
      </div>
      {bands.length > 0 && (
        <label className={styles.band}>
          <span>{t('Band')}</span>
          <select value={bandId ?? ''} onChange={(e) => onBandChange(e.target.value || null)}>
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
      <button type="button" className={styles.done} onClick={close}>
        {t('Done')}
      </button>
    </>
  );
}
