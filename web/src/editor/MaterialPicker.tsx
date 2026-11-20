// Picking a material on a phone: a sheet with the library's boards as cards (a tap selects) instead
// of a system dropdown, so each board shows its price and size.
import { useTranslation } from 'react-i18next';
import { boardSummary } from '../library/LibraryCards';
import { materialKind, type MaterialKind } from '../model/library';
import { addLinearMaterial, addMaterial, useStore } from '../store/store';
import { BottomSheet } from '../ui/BottomSheet';
import { promptDialog } from '../ui/dialogs';
import { CheckIcon, PlusIcon } from '../ui/icons';
import styles from './MaterialPicker.module.css';

export function MaterialPickerSheet({
  title,
  value,
  anyLabel,
  sheet,
  kind = 'sheet',
  stockLength,
  onPick,
  onClose,
}: {
  title: string;
  value: string | null;
  /** Adds an empty choice at the top ("Any board" / "Any bar"). */
  anyLabel?: string;
  /** Sheet size for a new material's per-sheet price. */
  sheet?: { length: number; width: number };
  /** Material kind offered by this picker. */
  kind?: MaterialKind;
  /** Bar length for a new linear material's per-piece price. */
  stockLength?: number;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const allMaterials = useStore((s) => s.materials);
  const materials = allMaterials.filter((m) => materialKind(m) === kind);
  const currency = useStore((s) => s.settings.currency);
  const pick = (id: string | null) => {
    onPick(id);
    onClose();
  };
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className={styles.list}>
        {anyLabel && (
          <button
            type="button"
            className={styles.card}
            aria-pressed={value === null}
            onClick={() => pick(null)}
          >
            <span className={styles.swatch} data-none="" aria-hidden="true" />
            <span className={styles.text}>
              <span className={styles.name}>{anyLabel}</span>
            </span>
            {value === null && <CheckIcon size={20} />}
          </button>
        )}
        {materials.map((m) => {
          const [price, meta] = boardSummary(m, currency, t);
          return (
            <button
              key={m.id}
              type="button"
              className={styles.card}
              aria-pressed={value === m.id}
              onClick={() => pick(m.id)}
            >
              <span className={styles.swatch} style={{ background: m.color }} aria-hidden="true" />
              <span className={styles.text}>
                <span className={styles.name}>{m.name}</span>
                <span>{price}</span>
                <span className={styles.meta}>{meta}</span>
              </span>
              {value === m.id && <CheckIcon size={20} />}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.action}
        onClick={async () => {
          const name = await promptDialog({
            title: t('New material'),
            label:
              kind === 'linear'
                ? t('Name of the new linear stock, e.g. “KVH 45x95”')
                : t('Name of the new material, e.g. “DTD White 18mm”'),
            confirmLabel: t('Add'),
          });
          if (name) {
            pick(
              kind === 'linear'
                ? addLinearMaterial(name, stockLength ? { stockLength } : undefined).id
                : addMaterial(name, sheet).id,
            );
          }
        }}
      >
        <PlusIcon size={20} />
        {t('+ New material…')}
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={() => {
          onClose();
          useStore.getState().setView('library');
        }}
      >
        {t('Materials & prices')}
      </button>
    </BottomSheet>
  );
}
