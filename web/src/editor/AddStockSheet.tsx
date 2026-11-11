// "Add sheet" on a phone: pick a board from the library (its size is used), or start a sheet of
// a custom size.
import { useTranslation } from 'react-i18next';
import { boardSummary } from '../library/LibraryCards';
import { emptyStock, type StockRow } from '../model/project';
import { addStock, useStore } from '../store/store';
import { BottomSheet } from '../ui/BottomSheet';
import { PlusIcon } from '../ui/icons';
import styles from './MaterialPicker.module.css';

export function AddStockSheet({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  /** Called with the new sheet, so its card can open. */
  onAdded: (sheet: StockRow) => void;
}) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const currency = useStore((s) => s.settings.currency);
  const add = (patch: Partial<StockRow>) => {
    const sheet = { ...emptyStock(), ...patch };
    addStock(sheet);
    onAdded(sheet);
    onClose();
  };
  return (
    <BottomSheet title={t('Add sheet')} onClose={onClose}>
      <div className={styles.list}>
        {materials.map((m) => {
          const [price, meta] = boardSummary(m, currency, t);
          return (
            <button
              key={m.id}
              type="button"
              className={styles.card}
              onClick={() => add({ materialId: m.id, length: m.sheetLength, width: m.sheetWidth })}
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
        })}
      </div>
      <button type="button" className={styles.action} onClick={() => add({})}>
        <PlusIcon size={20} />
        {t('Custom size')}
      </button>
    </BottomSheet>
  );
}
