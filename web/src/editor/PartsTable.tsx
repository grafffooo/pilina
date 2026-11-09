import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { Grain } from '../engine/types';
import { swatch } from '../model/describe';
import { missingPartFields } from '../model/job';
import { isMultiCell, parsePartRows } from '../model/paste';
import { countPieces, emptyPart, isBlankPart, type PartRow, type Project } from '../model/project';
import { duplicatePart, insertParts, removePart, replacePart, updatePart } from '../store/store';
import { MoreIcon, PlusIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import { Menu } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import { EdgePicker } from './EdgePicker';
import { MaterialSelect } from './MaterialSelect';
import styles from './Editor.module.css';

const GRAIN_NEXT: Record<Grain, Grain> = { none: 'length', length: 'width', width: 'none' };
const GRAIN_TEXT: Record<Grain, string> = { none: 'Any', length: 'Length', width: 'Width' };
const GRAIN_HELP: Record<Grain, string> = {
  none: 'Grain: any direction (the part may be rotated)',
  length: 'Grain: along the sheet length',
  width: 'Grain: across the sheet (along its width)',
};

/** Moves focus to the same column in another row (Enter / Shift+Enter). */
function focusCell(table: HTMLElement | null, row: number, col: string) {
  table?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`)?.focus();
}

export function PartsTable({ project }: { project: Project }) {
  const parts = project.parts;
  const pieces = countPieces(project);
  const rowsWithData = parts.filter((p) => !isBlankPart(p)).length;
  // Only ask for a material per part once the project cuts more than one board type.
  const stockMaterials = new Set(project.stock.map((s) => s.materialId).filter(Boolean));
  const showMaterial = stockMaterials.size > 1 || parts.some((p) => p.materialId);

  const addRow = (focusCol = 'length') => {
    insertParts([emptyPart()]);
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
    else if (target >= 0) focusCell(document.getElementById('parts-table'), target, col);
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
    <section className={styles.card} aria-labelledby="parts-h">
      <div className={styles.cardHeader}>
        <h2 id="parts-h">Parts</h2>
        <span className={styles.cardMeta}>
          {pieces} {pieces === 1 ? 'piece' : 'pieces'} in {rowsWithData}{' '}
          {rowsWithData === 1 ? 'row' : 'rows'}
        </span>
        <span className={styles.spacer} />
        <button type="button" className={ui.buttonPrimary} onClick={() => addRow()}>
          Add part
        </button>
      </div>
      <div className={styles.tableWrap}>
        <table id="parts-table" className={`${styles.table} ${styles.partsTable}`}>
          <thead>
            <tr>
              <th className={styles.colCheck}>
                <span className="sr-only">Use</span>
              </th>
              <th className={styles.num}>Length</th>
              <th className={styles.num}>Width</th>
              <th className={`${styles.num} ${styles.colQty}`}>Qty</th>
              <th>Label</th>
              {showMaterial && <th>Material</th>}
              <th className={styles.colGrain}>Grain</th>
              <th className={styles.colEdges}>Edges</th>
              <th className={styles.colMore}>
                <span className="sr-only">More</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p, i) => {
              const missing = missingPartFields(p);
              const name = p.label || `Part ${i + 1}`;
              const cell = (col: 'length' | 'width' | 'qty', label: string) => (
                <NumberInput
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
              return (
                <tr key={p.id} className={p.enabled ? undefined : styles.disabledRow}>
                  <td className={`${styles.colCheck} ${styles.cCheck}`}>
                    <span className={styles.checkWrap}>
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        aria-label={`Include ${name}`}
                        onChange={(e) => updatePart(p.id, { enabled: e.target.checked })}
                      />
                      <span
                        className={styles.swatch}
                        style={{ background: swatch(i) }}
                        aria-hidden="true"
                      />
                    </span>
                  </td>
                  <td className={styles.cLength}>{cell('length', 'Length')}</td>
                  <td className={styles.cWidth}>{cell('width', 'Width')}</td>
                  <td className={`${styles.colQty} ${styles.cQty}`}>{cell('qty', 'Qty')}</td>
                  <td className={styles.cLabel}>
                    <input
                      className={`${styles.cell} ${styles.cellText}`}
                      aria-label={`Label, part ${i + 1}`}
                      placeholder="Label"
                      data-row={i}
                      data-col="label"
                      value={p.label}
                      onChange={(e) => updatePart(p.id, { label: e.target.value }, `${p.id}.label`)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      onPaste={(e) => onPaste(e, p)}
                    />
                  </td>
                  {showMaterial && (
                    <td className={styles.cMaterial}>
                      <MaterialSelect
                        value={p.materialId}
                        anyLabel="Any board"
                        ariaLabel={`Material, ${name}`}
                        onChange={(materialId) => updatePart(p.id, { materialId })}
                      />
                    </td>
                  )}
                  <td className={`${styles.colGrain} ${styles.cGrain}`}>
                    <button
                      type="button"
                      className={p.grain === 'none' ? styles.grain : styles.grainSet}
                      aria-label={`${GRAIN_HELP[p.grain]}. Change`}
                      title={GRAIN_HELP[p.grain]}
                      onClick={() => updatePart(p.id, { grain: GRAIN_NEXT[p.grain] })}
                    >
                      {GRAIN_TEXT[p.grain]}
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
                      ariaLabel={`More actions for ${name}`}
                      triggerClassName={ui.iconButton}
                      items={[
                        { label: 'Duplicate', onSelect: () => duplicatePart(p.id) },
                        { label: 'Delete', danger: true, onSelect: () => removePart(p.id) },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.cardFooter}>
        <button type="button" className={styles.addRow} onClick={() => addRow()}>
          <PlusIcon size={16} />
          Add a part, or paste rows from a spreadsheet
        </button>
      </div>
    </section>
  );
}
