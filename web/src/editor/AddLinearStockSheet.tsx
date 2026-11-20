// "Add bar" on a phone: pick a linear material from the library (its stock length is used),
// or start a custom length bar.
import { useTranslation } from 'react-i18next';
import { boardSummary } from '../library/LibraryCards';
import { materialKind } from '../model/library';
import { emptyLinearStock, type LinearStockRow } from '../model/project';
import { addLinearStock, useStore } from '../store/store';
import { BottomSheet } from '../ui/BottomSheet';
import { PlusIcon } from '../ui/icons';
import styles from './MaterialPicker.module.css';

export function AddLinearStockSheet({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  /** Called with the new bar, so its card can open. */
  onAdded: (bar: LinearStockRow) => void;
}) {
  const { t } = useTranslation();
  const allMaterials = useStore((s) => s.materials);
  const materials = allMaterials.filter((m) => materialKind(m) === 'linear');
  const currency = useStore((s) => s.settings.currency);
  const add = (patch: Partial<LinearStockRow>) => {
    const bar = { ...emptyLinearStock(), ...patch };
    addLinearStock(bar);
    onAdded(bar);
    onClose();
  };
  return (
    <BottomSheet title={t('Add bar')} onClose={onClose}>
      <div className={styles.list}>
        {materials.length === 0 ? (
          <p className={styles.emptyNote}>{t('No linear stock in library yet.')}</p>
        ) : (
          materials.map((m) => {
            const [price, meta] = boardSummary(m, currency, t);
            return (
              <button
                key={m.id}
                type="button"
                className={styles.card}
                onClick={() => add({ materialId: m.id, length: m.stockLength ?? 3000 })}
              >
                <span className={styles.swatch} style={{ background: m.color }} aria-hidden="true" />
                <span className={styles.text}>
                  <span className={styles.name}>{m.name}</span>
                  <span>{price}</span>
                  <span className={styles.meta}>{meta}</span>
                </span>
                <PlusIcon size={20} />
              </button>
            );
          })
        )}
      </div>
      <button type="button" className={styles.action} onClick={() => add({ length: 3000 })}>
        <PlusIcon size={20} />
        {t('Custom length')}
      </button>
    </BottomSheet>
  );
}
