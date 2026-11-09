import { stockIsComplete } from '../model/job';
import { emptyStock, type Project } from '../model/project';
import { addStock, duplicateStock, removeStock, updateStock, useStore } from '../store/store';
import { MoreIcon, StarIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import { Menu } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import { MaterialSelect } from './MaterialSelect';
import styles from './Editor.module.css';

export function StockTable({ project }: { project: Project }) {
  const materials = useStore((s) => s.materials);
  const nameOf = (id: string | null) => materials.find((m) => m.id === id)?.name;
  return (
    <section className={styles.card} aria-labelledby="stock-h">
      <div className={styles.cardHeader}>
        <h2 id="stock-h">Stock sheets</h2>
        <span className={styles.cardMeta}>Starred first, then largest</span>
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
          Add sheet
        </button>
      </div>
      <div className={styles.tableWrap}>
        <table id="stock-table" className={`${styles.table} ${styles.stockTable}`}>
          <thead>
            <tr>
              <th className={styles.colCheck}>
                <span className="sr-only">Use</span>
              </th>
              <th className={styles.num}>Length</th>
              <th className={styles.num}>Width</th>
              <th className={`${styles.num} ${styles.colQty}`}>Qty</th>
              <th>Material</th>
              <th className={styles.colStar}>Priority</th>
              <th className={styles.colMore}>
                <span className="sr-only">More</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {project.stock.map((s, i) => {
              const name = nameOf(s.materialId) || `Sheet ${i + 1}`;
              const started = s.length !== null || s.width !== null;
              const bad = started && !stockIsComplete(s);
              return (
                <tr key={s.id} className={s.enabled ? undefined : styles.disabledRow}>
                  <td className={`${styles.colCheck} ${styles.cCheck}`}>
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      aria-label={`Use ${name}`}
                      onChange={(e) => updateStock(s.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className={styles.cLength}>
                    <NumberInput
                      className={styles.cell}
                      aria-label={`Length, ${name}`}
                      aria-invalid={(bad && !s.length) || undefined}
                      placeholder="Length"
                      data-row={i}
                      value={s.length}
                      onCommit={(v) => updateStock(s.id, { length: v }, `${s.id}.length`)}
                    />
                  </td>
                  <td className={styles.cWidth}>
                    <NumberInput
                      className={styles.cell}
                      aria-label={`Width, ${name}`}
                      aria-invalid={(bad && !s.width) || undefined}
                      placeholder="Width"
                      value={s.width}
                      onCommit={(v) => updateStock(s.id, { width: v }, `${s.id}.width`)}
                    />
                  </td>
                  <td className={`${styles.colQty} ${styles.cQty}`}>
                    <NumberInput
                      className={styles.cell}
                      aria-label={`Quantity, ${name}. Leave empty for unlimited`}
                      title="Leave empty for unlimited"
                      placeholder="∞"
                      emptyText=""
                      value={s.qty}
                      onCommit={(v) => updateStock(s.id, { qty: v }, `${s.id}.qty`)}
                    />
                  </td>
                  <td className={styles.cMaterial}>
                    <MaterialSelect
                      value={s.materialId}
                      ariaLabel={`Material, sheet ${i + 1}`}
                      sheet={s.length && s.width ? { length: s.length, width: s.width } : undefined}
                      onChange={(materialId) => updateStock(s.id, { materialId })}
                    />
                  </td>
                  <td className={`${styles.colStar} ${styles.cStar}`}>
                    <button
                      type="button"
                      className={s.priority ? styles.starOn : styles.star}
                      aria-pressed={s.priority}
                      aria-label={`Use ${name} first`}
                      title="Used before other sheets"
                      onClick={() => updateStock(s.id, { priority: !s.priority })}
                    >
                      <StarIcon filled={s.priority} />
                    </button>
                  </td>
                  <td className={`${styles.colMore} ${styles.cMore}`}>
                    <Menu
                      label={<MoreIcon />}
                      ariaLabel={`More actions for ${name}`}
                      triggerClassName={ui.iconButton}
                      items={[
                        { label: 'Duplicate', onSelect: () => duplicateStock(s.id) },
                        { label: 'Delete', danger: true, onSelect: () => removeStock(s.id) },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
