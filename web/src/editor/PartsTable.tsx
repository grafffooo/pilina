import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { swatch } from '../model/describe';
import { missingPartFields } from '../model/job';
import { isMultiCell, parsePartRows } from '../model/paste';
import { countPieces, emptyPart, isBlankPart, type PartRow, type Project } from '../model/project';
import { duplicatePart, insertParts, removePart, replacePart, updatePart } from '../store/store';
import { MoreIcon, PlusIcon } from '../ui/icons';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { ProjectSettingChips } from './ProjectSettingChips';
import { Menu } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import { EdgePicker } from './EdgePicker';
import { MaterialSelect } from './MaterialSelect';
import { PartCards } from './PartCards';
import { useMediaQuery } from '../ui/hooks';
import { focusCell, grainHelp, grainText, GRAIN_NEXT } from './partFields';
import styles from './Editor.module.css';
import { useTranslation } from 'react-i18next';

export function PartsTable({ project }: { project: Project }) {
  const { t } = useTranslation();
  const parts = project.parts;
  const pieces = countPieces(project);
  const rowsWithData = parts.filter((p) => !isBlankPart(p)).length;
  // Only ask for a material per part once the project cuts more than one board type.
  const stockMaterials = new Set(project.stock.map((s) => s.materialId).filter(Boolean));
  const showMaterial = stockMaterials.size > 1 || parts.some((p) => p.materialId);

  // On a phone the rows are cards; a new part opens its card.
  const phone = useMediaQuery('(max-width: 767px)');
  // Which card is open, for this project; another project starts on its blank row (a new
  // project's first part), ready to type in.
  const blank = parts.find(isBlankPart);
  const [open, setOpen] = useState<{ project: string; id: string | null }>(() => ({
    project: project.id,
    id: blank?.id ?? null,
  }));
  const openId = open.project === project.id ? open.id : (blank?.id ?? null);
  // Another project: start over on its blank row (adjusted while rendering, before it shows).
  if (open.project !== project.id) setOpen({ project: project.id, id: blank?.id ?? null });
  const setOpenId = (id: string | null) => setOpen({ project: project.id, id });

  const addRow = (focusCol = 'length') => {
    const part = emptyPart();
    insertParts([part]);
    if (phone) setOpenId(part.id);
    // Focus after React renders the new row.
    requestAnimationFrame(() =>
      focusCell(document.getElementById('parts-table'), parts.length, focusCol),
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, row: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const col = e.currentTarget.dataset.col ?? 'length';
    const target = e.shiftKey ? row - 1 : row + 1;
    if (target >= parts.length) addRow(col);
    else if (target >= 0) {
      const next = parts[target]!;
      if (phone) setOpenId(next.id);
      requestAnimationFrame(() => focusCell(document.getElementById('parts-table'), target, col));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>, part: PartRow) => {
    const text = e.clipboardData.getData('text/plain');
    if (!isMultiCell(text)) return;
    const rows = parsePartRows(text);
    if (rows.length === 0) return;
    e.preventDefault();
    if (isBlankPart(part)) replacePart(part.id, rows);
    else insertParts(rows, part.id);
  };

  return (
    <section className={styles.card} aria-labelledby="parts-h" data-cards={phone ? '' : undefined}>
      <div className={styles.cardHeader}>
        <h2 id="parts-h">{t('Parts')}</h2>
        <span className={styles.cardMeta}>
          {t('n_pieces', { count: pieces })} · {t('n_rows', { count: rowsWithData })}
        </span>
        <span className={styles.spacer} />
        <span className={styles.headerActions}>
          <ProjectSettingChips project={project} />
          <button type="button" className={ui.buttonPrimary} onClick={() => addRow()}>
            {t('Add part')}
          </button>
        </span>
      </div>
      {phone ? (
        <PartCards
          project={project}
          showMaterial={showMaterial}
          openId={openId}
          setOpenId={setOpenId}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      ) : (
        <div className={styles.tableWrap}>
          <table id="parts-table" className={`${styles.table} ${styles.partsTable}`}>
            <thead>
              <tr>
                <th className={styles.colCheck}>
                  <span className="sr-only">{t('Use')}</span>
                </th>
                <th className={styles.num}>{t('Length')}</th>
                <th className={styles.num}>{t('Width')}</th>
                <th className={`${styles.num} ${styles.colQty}`}>{t('Qty')}</th>
                <th>{t('Label')}</th>
                {showMaterial && <th>{t('Material')}</th>}
                <th className={styles.colGrain}>{t('Grain')}</th>
                <th className={styles.colEdges}>{t('Edges')}</th>
                <th className={styles.colMore}>
                  <span className="sr-only">{t('More')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => {
                const missing = missingPartFields(p);
                const name = p.label || t('Part {{n}}', { n: i + 1 });
                const cell = (col: 'length' | 'width' | 'qty', label: string) => {
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
                      onCommit={(v) => updatePart(p.id, { [col]: v }, `${p.id}.${col}`)}
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
                          onChange={(e) => updatePart(p.id, { enabled: e.target.checked })}
                        />
                        <span
                          className={styles.swatch}
                          style={{ background: swatch(i) }}
                          aria-hidden="true"
                        />
                      </span>
                    </td>
                    <td className={styles.cLength}>{cell('length', t('Length'))}</td>
                    <td className={styles.cWidth}>{cell('width', t('Width'))}</td>
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
                          updatePart(p.id, { label: e.target.value }, `${p.id}.label`)
                        }
                        onKeyDown={(e) => onKeyDown(e, i)}
                        onPaste={(e) => onPaste(e, p)}
                      />
                    </td>
                    {showMaterial && (
                      <td className={styles.cMaterial}>
                        <MaterialSelect
                          value={p.materialId}
                          anyLabel={t('Any board')}
                          ariaLabel={t('Material, {{name}}', { name })}
                          onChange={(materialId) => updatePart(p.id, { materialId })}
                        />
                      </td>
                    )}
                    <td className={`${styles.colGrain} ${styles.cGrain}`}>
                      <button
                        type="button"
                        className={p.grain === 'none' ? styles.grain : styles.grainSet}
                        aria-label={t('{{help}}. Change', { help: grainHelp(p.grain) })}
                        title={grainHelp(p.grain)}
                        onClick={() => updatePart(p.id, { grain: GRAIN_NEXT[p.grain] })}
                      >
                        {grainText(p.grain)}
                      </button>
                    </td>
                    <td className={`${styles.colEdges} ${styles.cEdges}`}>
                      <EdgePicker
                        edges={p.edges}
                        partName={name}
                        bandId={p.edgeBandId}
                        onChange={(edges) => updatePart(p.id, { edges })}
                        onBandChange={(edgeBandId) => updatePart(p.id, { edgeBandId })}
                      />
                    </td>
                    <td className={`${styles.colMore} ${styles.cMore}`}>
                      <Menu
                        label={<MoreIcon />}
                        ariaLabel={t('More actions for {{name}}', { name })}
                        triggerClassName={ui.iconButton}
                        items={[
                          { label: t('Duplicate'), onSelect: () => duplicatePart(p.id) },
                          { label: t('Delete'), danger: true, onSelect: () => removePart(p.id) },
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
        <button type="button" className={styles.addRow} onClick={() => addRow()}>
          <PlusIcon size={16} />
          {t('Add a part, or paste rows from a spreadsheet')}
        </button>
      </div>
    </section>
  );
}
