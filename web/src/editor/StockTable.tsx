import { stockIsComplete } from '../model/job';
import { emptyStock, type Project } from '../model/project';
import { matchingOffcuts } from '../model/offcut';
import {
  addStock,
  duplicateStock,
  removeStock,
  updateProject,
  updateStock,
  useStore,
} from '../store/store';
import { MoreIcon, StarIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import { Menu } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import { MaterialSelect } from './MaterialSelect';
import styles from './Editor.module.css';
import { useTranslation } from 'react-i18next';

export function StockTable({ project }: { project: Project }) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const nameOf = (id: string | null) => materials.find((m) => m.id === id)?.name;
  return (
    <section className={styles.card} aria-labelledby="stock-h">
      <div className={styles.cardHeader}>
        <h2 id="stock-h">{t('Stock sheets')}</h2>
        <span className={styles.cardMeta}>{t('Starred first, then largest')}</span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={ui.button}
          onClick={() => {
            addStock(emptyStock());
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLInputElement>(
                  `#stock-table [data-row="${project.stock.length}"]`,
                )
                ?.focus(),
            );
          }}
        >
          {t('Add sheet')}
        </button>
      </div>
      <div className={styles.tableWrap}>
        <table id="stock-table" className={`${styles.table} ${styles.stockTable}`}>
          <thead>
            <tr>
              <th className={styles.colCheck}>
                <span className="sr-only">{t('Use')}</span>
              </th>
              <th className={styles.num}>{t('Length')}</th>
              <th className={styles.num}>{t('Width')}</th>
              <th className={`${styles.num} ${styles.colQty}`}>{t('Qty')}</th>
              <th>{t('Material')}</th>
              <th className={styles.colStar}>{t('Priority')}</th>
              <th className={styles.colMore}>
                <span className="sr-only">{t('More')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {project.stock.map((s, i) => {
              const name = nameOf(s.materialId) || t('Sheet {{n}}', { n: i + 1 });
              const started = s.length !== null || s.width !== null;
              const bad = started && !stockIsComplete(s);
              return (
                <tr key={s.id} className={s.enabled ? undefined : styles.disabledRow}>
                  <td className={`${styles.colCheck} ${styles.cCheck}`}>
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      aria-label={t('Use {{name}}', { name })}
                      onChange={(e) => updateStock(s.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className={styles.cLength}>
                    <NumberInput
                      className={styles.cell}
                      aria-label={t('Length, {{name}}', { name })}
                      aria-invalid={(bad && !s.length) || undefined}
                      placeholder={t('Length')}
                      data-row={i}
                      value={s.length}
                      onCommit={(v) => updateStock(s.id, { length: v }, `${s.id}.length`)}
                    />
                  </td>
                  <td className={styles.cWidth}>
                    <NumberInput
                      className={styles.cell}
                      aria-label={t('Width, {{name}}', { name })}
                      aria-invalid={(bad && !s.width) || undefined}
                      placeholder={t('Width')}
                      value={s.width}
                      onCommit={(v) => updateStock(s.id, { width: v }, `${s.id}.width`)}
                    />
                  </td>
                  <td className={`${styles.colQty} ${styles.cQty}`}>
                    <NumberInput
                      className={styles.cell}
                      aria-label={t('Quantity, {{name}}. Leave empty for unlimited', { name })}
                      title={t('Leave empty for unlimited')}
                      placeholder="∞"
                      emptyText=""
                      value={s.qty}
                      onCommit={(v) => updateStock(s.id, { qty: v }, `${s.id}.qty`)}
                    />
                  </td>
                  <td className={styles.cMaterial}>
                    <MaterialSelect
                      value={s.materialId}
                      ariaLabel={t('Material, sheet {{n}}', { n: i + 1 })}
                      sheet={s.length && s.width ? { length: s.length, width: s.width } : undefined}
                      onChange={(materialId) => updateStock(s.id, { materialId })}
                    />
                  </td>
                  <td className={`${styles.colStar} ${styles.cStar}`}>
                    <button
                      type="button"
                      className={s.priority ? styles.starOn : styles.star}
                      aria-pressed={s.priority}
                      aria-label={t('Use {{name}} first', { name })}
                      title={t('Used before other sheets')}
                      onClick={() => updateStock(s.id, { priority: !s.priority })}
                    >
                      <StarIcon filled={s.priority} />
                    </button>
                  </td>
                  <td className={`${styles.colMore} ${styles.cMore}`}>
                    <Menu
                      label={<MoreIcon />}
                      ariaLabel={t('More actions for {{name}}', { name })}
                      triggerClassName={ui.iconButton}
                      items={[
                        { label: t('Duplicate'), onSelect: () => duplicateStock(s.id) },
                        { label: t('Delete'), danger: true, onSelect: () => removeStock(s.id) },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <OffcutsFooter project={project} />
    </section>
  );
}

function OffcutsFooter({ project }: { project: Project }) {
  const { t } = useTranslation();
  const offcuts = useStore((s) => s.offcuts);
  const matching = matchingOffcuts(project, offcuts).length;
  return (
    <div className={styles.offcutFooter}>
      <input
        id="use-offcuts"
        type="checkbox"
        className={styles.checkbox}
        checked={project.useOffcuts}
        onChange={(e) => updateProject({ useOffcuts: e.target.checked })}
      />
      <label htmlFor="use-offcuts" className={styles.offcutText}>
        <span className={styles.offcutTitle}>{t('Use matching library offcuts first')}</span>
        <span className={styles.cardMeta}>
          {matching === 0
            ? t('No offcuts in these materials are in the library yet.')
            : t('n_matching_offcuts', { count: matching })}
        </span>
      </label>
      <button
        type="button"
        className={styles.addRow}
        onClick={() => useStore.getState().setView('offcuts')}
      >
        {t('Open library')}
      </button>
    </div>
  );
}
