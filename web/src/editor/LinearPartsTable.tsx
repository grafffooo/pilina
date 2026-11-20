import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLength } from '../lib/units';
import { swatch } from '../model/describe';
import { missingLinearPartFields } from '../model/job';
import { isMultiCell, parseLinearPartRows } from '../model/paste';
import {
  emptyLinearPart,
  isBlankLinearPart,
  type LinearPartRow,
  type Project,
} from '../model/project';
import {
  duplicateLinearPart,
  insertLinearParts,
  removeLinearPart,
  replaceLinearPart,
  updateLinearPart,
  useStore,
} from '../store/store';
import { useMediaQuery } from '../ui/hooks';
import { MoreIcon, PlusIcon } from '../ui/icons';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { Menu } from '../ui/Popover';
import { CardActions, CardField, CardFields, cardStyles, RowCard } from '../ui/RowCard';
import ui from '../ui/ui.module.css';
import styles from './Editor.module.css';
import { MaterialSelect } from './MaterialSelect';
import { focusCell } from './partFields';
import { LinearSettingChips } from './ProjectSettingChips';

export function LinearPartsTable({ project }: { project: Project }) {
  const { t } = useTranslation();
  const parts = project.linearParts;
  const pieces = parts.reduce((n, p) => n + (p.enabled && p.length && p.qty ? p.qty : 0), 0);
  const rowsWithData = parts.filter((p) => !isBlankLinearPart(p)).length;
  const stockMaterials = new Set(project.linearStock.map((s) => s.materialId).filter(Boolean));
  const showMaterial = stockMaterials.size > 1 || parts.some((p) => p.materialId);

  const phone = useMediaQuery('(max-width: 767px)');
  const blank = parts.find(isBlankLinearPart);
  const [open, setOpen] = useState<{ project: string; id: string | null }>(() => ({
    project: project.id,
    id: blank?.id ?? null,
  }));
  const openId = open.project === project.id ? open.id : (blank?.id ?? null);
  const setOpenId = (id: string | null) => setOpen({ project: project.id, id });

  const addRow = (focusCol = 'length') => {
    const part = emptyLinearPart();
    insertLinearParts([part]);
    if (phone) setOpenId(part.id);
    requestAnimationFrame(() =>
      focusCell(document.getElementById('linear-parts-table'), parts.length, focusCol),
    );
  };

  const onAdd = () => (phone ? useStore.getState().setView('add-linear-part') : addRow());

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, row: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const col = e.currentTarget.dataset.col ?? 'length';
    const target = e.shiftKey ? row - 1 : row + 1;
    if (target >= parts.length) addRow(col);
    else if (target >= 0) {
      const next = parts[target]!;
      if (phone) setOpenId(next.id);
      requestAnimationFrame(() =>
        focusCell(document.getElementById('linear-parts-table'), target, col),
      );
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>, part: LinearPartRow) => {
    const text = e.clipboardData.getData('text/plain');
    if (!isMultiCell(text)) return;
    const rows = parseLinearPartRows(text);
    if (rows.length === 0) return;
    e.preventDefault();
    if (isBlankLinearPart(part)) replaceLinearPart(part.id, rows);
    else insertLinearParts(rows, part.id);
  };

  return (
    <section
      className={styles.card}
      aria-labelledby="linear-parts-h"
      data-cards={phone ? '' : undefined}
    >
      <div className={styles.cardHeader}>
        <h2 id="linear-parts-h">{t('Linear parts')}</h2>
        <span className={styles.cardMeta}>
          {t('n_pieces', { count: pieces })} · {t('n_rows', { count: rowsWithData })}
        </span>
        <span className={styles.spacer} />
        <span className={styles.headerActions}>
          <LinearSettingChips project={project} />
          <button type="button" className={ui.buttonPrimary} onClick={onAdd}>
            {t('Add part')}
          </button>
        </span>
      </div>
      {phone ? (
        <LinearPartCards
          parts={parts}
          showMaterial={showMaterial}
          openId={openId}
          setOpenId={setOpenId}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      ) : (
        <div className={styles.tableWrap}>
          <table id="linear-parts-table" className={`${styles.table} ${styles.linearPartsTable}`}>
            <thead>
              <tr>
                <th className={styles.colCheck}>
                  <span className="sr-only">{t('Use')}</span>
                </th>
                <th className={styles.num}>{t('Length')}</th>
                <th className={`${styles.num} ${styles.colQty}`}>{t('Qty')}</th>
                <th>{t('Label')}</th>
                {showMaterial && <th>{t('Material')}</th>}
                <th className={styles.colMore}>
                  <span className="sr-only">{t('More')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => {
                const missing = missingLinearPartFields(p);
                const name = p.label || t('Part {{n}}', { n: i + 1 });
                const cell = (col: 'length' | 'qty', label: string) => {
                  const Input = col === 'qty' ? NumberInput : LengthInput;
                  return (
                    <Input
                      className={styles.cell}
                      aria-label={`${label}, ${name}`}
                      aria-invalid={missing.has(col) || undefined}
                      placeholder={label}
                      data-row={i}
                      data-col={col}
                      value={p[col]}
                      onCommit={(v) => updateLinearPart(p.id, { [col]: v }, `${p.id}.${col}`)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      onPaste={(e) => onPaste(e, p)}
                    />
                  );
                };
                return (
                  <tr key={p.id} className={p.enabled ? undefined : styles.disabledRow}>
                    <td className={`${styles.colCheck} ${styles.cCheck}`}>
                      <span className={styles.checkWrap}>
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          aria-label={t('Include {{name}}', { name })}
                          onChange={(e) => updateLinearPart(p.id, { enabled: e.target.checked })}
                        />
                        <span
                          className={styles.swatch}
                          style={{ background: swatch(i) }}
                          aria-hidden="true"
                        />
                      </span>
                    </td>
                    <td className={styles.cLength}>{cell('length', t('Length'))}</td>
                    <td className={`${styles.colQty} ${styles.cQty}`}>{cell('qty', t('Qty'))}</td>
                    <td className={styles.cLabel}>
                      <input
                        className={`${styles.cell} ${styles.cellText}`}
                        aria-label={t('Label, part {{n}}', { n: i + 1 })}
                        placeholder={t('Label')}
                        data-row={i}
                        data-col="label"
                        value={p.label}
                        onChange={(e) =>
                          updateLinearPart(p.id, { label: e.target.value }, `${p.id}.label`)
                        }
                        onKeyDown={(e) => onKeyDown(e, i)}
                        onPaste={(e) => onPaste(e, p)}
                      />
                    </td>
                    {showMaterial && (
                      <td className={styles.cMaterial}>
                        <MaterialSelect
                          kind="linear"
                          value={p.materialId}
                          anyLabel={t('Any bar')}
                          ariaLabel={t('Material, {{name}}', { name })}
                          onChange={(materialId) => updateLinearPart(p.id, { materialId })}
                        />
                      </td>
                    )}
                    <td className={`${styles.colMore} ${styles.cMore}`}>
                      <Menu
                        label={<MoreIcon />}
                        ariaLabel={t('More actions for {{name}}', { name })}
                        triggerClassName={ui.iconButton}
                        items={[
                          { label: t('Duplicate'), onSelect: () => duplicateLinearPart(p.id) },
                          {
                            label: t('Delete'),
                            danger: true,
                            onSelect: () => removeLinearPart(p.id),
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
      <div className={styles.cardFooter}>
        <button type="button" className={styles.addRow} onClick={onAdd}>
          <PlusIcon size={16} />
          {t('Add a part, or paste rows from a spreadsheet')}
        </button>
      </div>
    </section>
  );
}

function LinearPartCards({
  parts,
  showMaterial,
  openId,
  setOpenId,
  onKeyDown,
  onPaste,
}: {
  parts: LinearPartRow[];
  showMaterial: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, row: number) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>, part: LinearPartRow) => void;
}) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const size = (v: number | null) => (v === null ? '—' : formatLength(v));

  return (
    <div id="linear-parts-table" className={cardStyles.list}>
      {parts.map((p, i) => {
        const missing = missingLinearPartFields(p);
        const name = p.label || t('Part {{n}}', { n: i + 1 });
        const material = materials.find((m) => m.id === p.materialId)?.name;
        const open = openId === p.id;
        return (
          <RowCard
            key={p.id}
            open={open}
            onToggle={() => setOpenId(open ? null : p.id)}
            label={`${name}, ${size(p.length)}`}
            muted={!p.enabled}
            lead={
              <input
                type="checkbox"
                checked={p.enabled}
                aria-label={t('Include {{name}}', { name })}
                onChange={(e) => updateLinearPart(p.id, { enabled: e.target.checked })}
              />
            }
            title={size(p.length)}
            badge={`× ${p.qty ?? '—'}`}
            lines={[
              p.label || t('Label'),
              showMaterial ? (material ?? t('Any bar')) : null,
            ].filter((x): x is string => Boolean(x))}
          >
            <CardFields>
              <CardField label={t('Length')}>
                <LengthInput
                  aria-label={`${t('Length')}, ${name}`}
                  aria-invalid={missing.has('length') || undefined}
                  placeholder={t('Length')}
                  data-row={i}
                  data-col="length"
                  value={p.length}
                  onCommit={(v) => updateLinearPart(p.id, { length: v }, `${p.id}.length`)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onPaste={(e) => onPaste(e, p)}
                />
              </CardField>
              <CardField label={t('Qty')}>
                <NumberInput
                  aria-label={`${t('Qty')}, ${name}`}
                  aria-invalid={missing.has('qty') || undefined}
                  placeholder={t('Qty')}
                  data-row={i}
                  data-col="qty"
                  value={p.qty}
                  onCommit={(v) => updateLinearPart(p.id, { qty: v }, `${p.id}.qty`)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onPaste={(e) => onPaste(e, p)}
                />
              </CardField>
            </CardFields>
            <CardField label={t('Label')}>
              <input
                aria-label={t('Label, part {{n}}', { n: i + 1 })}
                placeholder={t('Label')}
                data-row={i}
                data-col="label"
                value={p.label}
                onChange={(e) =>
                  updateLinearPart(p.id, { label: e.target.value }, `${p.id}.label`)
                }
                onKeyDown={(e) => onKeyDown(e, i)}
                onPaste={(e) => onPaste(e, p)}
              />
            </CardField>
            {showMaterial && (
              <CardField label={t('Material')}>
                <MaterialSelect
                  kind="linear"
                  value={p.materialId}
                  anyLabel={t('Any bar')}
                  ariaLabel={t('Material, {{name}}', { name })}
                  onChange={(materialId) => updateLinearPart(p.id, { materialId })}
                />
              </CardField>
            )}
            <CardActions>
              <button type="button" onClick={() => duplicateLinearPart(p.id)}>
                {t('Duplicate')}
              </button>
              <button type="button" data-danger="" onClick={() => removeLinearPart(p.id)}>
                {t('Delete')}
              </button>
            </CardActions>
          </RowCard>
        );
      })}
    </div>
  );
}
