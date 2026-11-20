import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLength, formatLengthUnit } from '../lib/units';
import { linearStockIsComplete } from '../model/job';
import { matchingLinearOffcuts } from '../model/offcut';
import { emptyLinearStock, type Project } from '../model/project';
import {
  addLinearStock,
  duplicateLinearStock,
  removeLinearStock,
  updateLinearStock,
  updateProject,
  useStore,
} from '../store/store';
import { useMediaQuery } from '../ui/hooks';
import { MoreIcon, StarIcon } from '../ui/icons';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { Menu } from '../ui/Popover';
import { CardActions, CardField, CardFields, cardStyles, RowCard } from '../ui/RowCard';
import { SortTh, useTableSort } from '../ui/tableSort';
import ui from '../ui/ui.module.css';
import { AddLinearStockSheet } from './AddLinearStockSheet';
import styles from './Editor.module.css';
import { MaterialSelect } from './MaterialSelect';

export function LinearStockTable({ project }: { project: Project }) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const nameOf = (id: string | null) => materials.find((m) => m.id === id)?.name;
  const { sortKey, sortDir, toggle, sortRows } = useTableSort<
    'enabled' | 'length' | 'qty' | 'material' | 'priority'
  >();
  const sortedStock = sortRows(project.linearStock, (s, key) => {
    switch (key) {
      case 'enabled':
        return s.enabled;
      case 'length':
        return s.length;
      case 'qty':
        return s.qty;
      case 'material':
        return nameOf(s.materialId) ?? null;
      case 'priority':
        return s.priority;
    }
  });
  const phone = useMediaQuery('(max-width: 767px)');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section
      className={styles.card}
      aria-labelledby="linear-stock-h"
      data-cards={phone ? '' : undefined}
    >
      <div className={styles.cardHeader}>
        <h2 id="linear-stock-h">{t('Linear stock')}</h2>
        <span className={styles.cardMeta}>{t('Starred first, then longest')}</span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={ui.button}
          onClick={() => {
            if (phone) {
              setAdding(true);
              return;
            }
            const bar = emptyLinearStock();
            addLinearStock(bar);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLInputElement>(
                  `#linear-stock-table [data-row="${project.linearStock.length}"]`,
                )
                ?.focus(),
            );
          }}
        >
          {t('Add bar')}
        </button>
      </div>
      {phone ? (
        <LinearStockCards project={project} openId={openId} setOpenId={setOpenId} />
      ) : (
        <div className={styles.tableWrap}>
          <table id="linear-stock-table" className={`${styles.table} ${styles.linearStockTable}`}>
            <thead>
              <tr>
                <SortTh col="enabled" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className={styles.colCheck}>
                  <span className="sr-only">{t('Use')}</span>
                </SortTh>
                <SortTh col="length" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className={styles.num} numeric>
                  {t('Length')}
                </SortTh>
                <SortTh col="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className={`${styles.num} ${styles.colQty}`} numeric>
                  {t('Qty')}
                </SortTh>
                <SortTh col="material" sortKey={sortKey} sortDir={sortDir} onSort={toggle}>
                  {t('Material')}
                </SortTh>
                <SortTh col="priority" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className={styles.colStar}>
                  {t('Priority')}
                </SortTh>
                <th className={styles.colMore}>
                  <span className="sr-only">{t('More')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStock.map((s, i) => {
                const name = nameOf(s.materialId) || t('Bar {{n}}', { n: i + 1 });
                const started = s.length !== null;
                const bad = started && !linearStockIsComplete(s);
                return (
                  <tr key={s.id} className={s.enabled ? undefined : styles.disabledRow}>
                    <td className={`${styles.colCheck} ${styles.cCheck}`}>
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        aria-label={t('Use {{name}}', { name })}
                        onChange={(e) => updateLinearStock(s.id, { enabled: e.target.checked })}
                      />
                    </td>
                    <td className={styles.cLength}>
                      <LengthInput
                        className={styles.cell}
                        aria-label={t('Length, {{name}}', { name })}
                        aria-invalid={(bad && !s.length) || undefined}
                        placeholder={t('Length')}
                        data-row={i}
                        value={s.length}
                        onCommit={(v) => updateLinearStock(s.id, { length: v }, `${s.id}.length`)}
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
                        onCommit={(v) => updateLinearStock(s.id, { qty: v }, `${s.id}.qty`)}
                      />
                    </td>
                    <td className={styles.cMaterial}>
                      <MaterialSelect
                        kind="linear"
                        value={s.materialId}
                        ariaLabel={t('Material, bar {{n}}', { n: i + 1 })}
                        stockLength={s.length ?? undefined}
                        onChange={(materialId) => updateLinearStock(s.id, { materialId })}
                      />
                    </td>
                    <td className={`${styles.colStar} ${styles.cStar}`}>
                      <button
                        type="button"
                        className={s.priority ? styles.starOn : styles.star}
                        aria-pressed={s.priority}
                        aria-label={t('Use {{name}} first', { name })}
                        title={t('Used before other bars')}
                        onClick={() => updateLinearStock(s.id, { priority: !s.priority })}
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
                          { label: t('Duplicate'), onSelect: () => duplicateLinearStock(s.id) },
                          {
                            label: t('Delete'),
                            danger: true,
                            onSelect: () => removeLinearStock(s.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <LinearOffcutsFooter project={project} />
      {adding && (
        <AddLinearStockSheet
          onClose={() => setAdding(false)}
          onAdded={(bar) => setOpenId(bar.id)}
        />
      )}
    </section>
  );
}

function LinearStockCards({
  project,
  openId,
  setOpenId,
}: {
  project: Project;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const size = (v: number | null) => (v === null ? '—' : formatLength(v));

  return (
    <div id="linear-stock-table" className={cardStyles.list}>
      {project.linearStock.map((s, i) => {
        const material = materials.find((m) => m.id === s.materialId);
        const name = material?.name || t('Bar {{n}}', { n: i + 1 });
        const started = s.length !== null;
        const bad = started && !linearStockIsComplete(s);
        const open = openId === s.id;
        const profile =
          material?.thickness && material?.profileWidth
            ? `${formatLength(material.thickness)} × ${formatLength(material.profileWidth)}`
            : material?.thickness
              ? formatLengthUnit(material.thickness)
              : null;

        return (
          <RowCard
            key={s.id}
            open={open}
            onToggle={() => setOpenId(open ? null : s.id)}
            label={`${name}, ${size(s.length)}`}
            muted={!s.enabled}
            lead={
              <input
                type="checkbox"
                checked={s.enabled}
                aria-label={t('Use {{name}}', { name })}
                onChange={(e) => updateLinearStock(s.id, { enabled: e.target.checked })}
              />
            }
            title={size(s.length)}
            badge={s.qty === null ? '∞' : `× ${s.qty}`}
            lines={[name, profile].filter((x): x is string => Boolean(x))}
            trail={s.priority ? <StarIcon filled size={22} /> : undefined}
          >
            <CardFields>
              <CardField label={t('Length')}>
                <LengthInput
                  aria-label={t('Length, {{name}}', { name })}
                  aria-invalid={(bad && !s.length) || undefined}
                  placeholder={t('Length')}
                  data-row={i}
                  value={s.length}
                  onCommit={(v) => updateLinearStock(s.id, { length: v }, `${s.id}.length`)}
                />
              </CardField>
              <CardField label={t('Qty')}>
                <NumberInput
                  aria-label={t('Quantity, {{name}}. Leave empty for unlimited', { name })}
                  placeholder="∞"
                  emptyText=""
                  value={s.qty}
                  onCommit={(v) => updateLinearStock(s.id, { qty: v }, `${s.id}.qty`)}
                />
              </CardField>
            </CardFields>
            <p className={cardStyles.hint}>{t('Leave empty for unlimited')}</p>
            <CardField label={t('Material')}>
              <MaterialSelect
                kind="linear"
                value={s.materialId}
                ariaLabel={t('Material, bar {{n}}', { n: i + 1 })}
                stockLength={s.length ?? undefined}
                onChange={(materialId) => updateLinearStock(s.id, { materialId })}
              />
            </CardField>
            <button
              type="button"
              className={cardStyles.toggle}
              aria-pressed={s.priority}
              aria-label={t('Use {{name}} first', { name })}
              onClick={() => updateLinearStock(s.id, { priority: !s.priority })}
            >
              <StarIcon filled={s.priority} size={22} />
              {t('Used before other bars')}
            </button>
            <CardActions>
              <button type="button" onClick={() => duplicateLinearStock(s.id)}>
                {t('Duplicate')}
              </button>
              <button type="button" data-danger="" onClick={() => removeLinearStock(s.id)}>
                {t('Delete')}
              </button>
            </CardActions>
          </RowCard>
        );
      })}
    </div>
  );
}

function LinearOffcutsFooter({ project }: { project: Project }) {
  const { t } = useTranslation();
  const offcuts = useStore((s) => s.offcuts);
  const matching = matchingLinearOffcuts(project, offcuts).length;
  return (
    <div className={styles.offcutFooter}>
      <label className={styles.offcutLabel}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={project.useOffcuts}
          onChange={(e) => updateProject({ useOffcuts: e.target.checked })}
        />
        <span className={styles.offcutText}>
          <span className={styles.offcutTitle}>{t('Use matching library offcuts first')}</span>
          <span className={styles.cardMeta}>
            {matching === 0
              ? t('No offcuts in these materials are in the library yet.')
              : t('n_matching_offcuts', { count: matching })}
          </span>
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
