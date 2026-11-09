import { addMaterial, useStore } from '../store/store';
import { promptDialog } from '../ui/dialogs';
import styles from './Editor.module.css';
import { useTranslation } from 'react-i18next';

const NEW = '__new__';

/**
 * Picks a material from the library, or creates one. `anyLabel` adds an empty choice
 * (for parts: "any board").
 */
export function MaterialSelect({
  value,
  onChange,
  ariaLabel,
  anyLabel,
  sheet,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  ariaLabel: string;
  anyLabel?: string;
  /** Sheet size for a new material's per-sheet price. */
  sheet?: { length: number; width: number };
}) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const known = value === null || materials.some((m) => m.id === value);
  return (
    <select
      className={styles.select}
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={async (e) => {
        const v = e.target.value;
        if (v !== NEW) {
          onChange(v || null);
          return;
        }
        const name = await promptDialog({
          title: t('New material'),
          label: t('Name of the new material, e.g. “DTD White 18mm”'),
          confirmLabel: t('Add'),
        });
        if (name) onChange(addMaterial(name, sheet).id);
      }}
    >
      {(anyLabel || value === null) && (
        <option value="">{anyLabel ?? t('Choose material…')}</option>
      )}
      {!known && <option value={value ?? ''}>{t('Deleted material')}</option>}
      {materials.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      <option value={NEW}>{t('+ New material…')}</option>
    </select>
  );
}
