// Per-project pricing choices: how board is charged, default edge band and extra cost lines.
import { emptyExtra, type ExtraLine, type Project } from '../model/project';
import { addEdgeBand, updatePricing, updateProject, useStore } from '../store/store';
import { CloseIcon, PlusIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import ui from '../ui/ui.module.css';
import styles from './Editor.module.css';

const NEW_BAND = '__new__';

export function PricingCard({ project }: { project: Project }) {
  const pricing = project.pricing;
  const bands = useStore((s) => s.edgeBands);
  const settings = useStore((s) => s.settings);

  const setExtras = (extras: ExtraLine[], key: string | null = null) =>
    updatePricing({ extras }, key);
  const updateExtra = (id: string, patch: Partial<ExtraLine>, key: string | null = null) =>
    setExtras(
      pricing.extras.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      key,
    );

  return (
    <section className={styles.card} aria-labelledby="costs-h">
      <div className={styles.cardHeader}>
        <h2 id="costs-h">Costs</h2>
        <span className={styles.cardMeta}>Prices in {settings.currency}</span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={ui.button}
          onClick={() => useStore.getState().setView('library')}
        >
          Materials & prices
        </button>
      </div>

      <div className={styles.form}>
        <div className={styles.formRow}>
          <span className={styles.formLabel} id="mode-label">
            Board is charged by
          </span>
          <div className={ui.segmented} role="group" aria-labelledby="mode-label">
            <button
              type="button"
              aria-pressed={pricing.mode === 'sheets'}
              onClick={() => updatePricing({ mode: 'sheets' })}
            >
              Whole sheets
            </button>
            <button
              type="button"
              aria-pressed={pricing.mode === 'area'}
              onClick={() => updatePricing({ mode: 'area' })}
            >
              Area used
            </button>
          </div>
        </div>

        {pricing.mode === 'area' ? (
          <label className={styles.formRow}>
            <span className={styles.formLabel}>Waste allowance</span>
            <span className={styles.inline}>
              <NumberInput
                className={`${ui.fieldInput} ${styles.shortInput}`}
                value={pricing.wastePct}
                onCommit={(v) => updatePricing({ wastePct: Math.max(0, v ?? 0) }, 'waste')}
              />
              % on top of the parts’ area
            </span>
          </label>
        ) : (
          <label className={styles.formRow}>
            <span className={styles.formLabel}>Leftovers</span>
            <span className={styles.inline}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={pricing.offcutCredit}
                onChange={(e) => updatePricing({ offcutCredit: e.target.checked })}
              />
              Credit reusable leftovers (at least {settings.offcutMinLength} ×{' '}
              {settings.offcutMinWidth} mm)
            </span>
          </label>
        )}

        <label className={styles.formRow}>
          <span className={styles.formLabel}>Edge band</span>
          <select
            className={`${ui.fieldInput} ${styles.bandSelect}`}
            value={project.defaultEdgeBandId ?? ''}
            onChange={(e) => {
              if (e.target.value === NEW_BAND) {
                updateProject({ defaultEdgeBandId: addEdgeBand().id });
                useStore.getState().setView('library');
              } else {
                updateProject({ defaultEdgeBandId: e.target.value || null });
              }
            }}
          >
            <option value="">No band chosen</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value={NEW_BAND}>+ New edge band…</option>
          </select>
        </label>
      </div>

      <div className={styles.extras}>
        <div className={styles.extrasTitle}>Extra costs</div>
        {pricing.extras.length === 0 && (
          <p className={styles.hint}>
            Hinges, runners, handles, labour… anything not cut from a sheet.
          </p>
        )}
        {pricing.extras.map((x, i) => (
          <div key={x.id} className={styles.extraRow}>
            <input
              className={`${styles.cell} ${styles.cellText}`}
              aria-label={`Description, extra cost ${i + 1}`}
              placeholder="Description"
              value={x.label}
              onChange={(e) => updateExtra(x.id, { label: e.target.value }, `${x.id}.label`)}
            />
            <NumberInput
              className={`${styles.cell} ${styles.extraQty}`}
              aria-label={`Quantity, extra cost ${i + 1}`}
              placeholder="Qty"
              value={x.qty}
              onCommit={(qty) => updateExtra(x.id, { qty }, `${x.id}.qty`)}
            />
            <span className={styles.times} aria-hidden="true">
              ×
            </span>
            <NumberInput
              className={`${styles.cell} ${styles.extraPrice}`}
              aria-label={`Price each, extra cost ${i + 1}`}
              placeholder="Price"
              value={x.amount}
              onCommit={(amount) => updateExtra(x.id, { amount }, `${x.id}.amount`)}
            />
            <button
              type="button"
              className={ui.iconButton}
              aria-label={`Remove extra cost ${i + 1}`}
              onClick={() => setExtras(pricing.extras.filter((e) => e.id !== x.id))}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.addRow}
          onClick={() => setExtras([...pricing.extras, emptyExtra()])}
        >
          <PlusIcon size={16} />
          Add a cost line
        </button>
      </div>
    </section>
  );
}
