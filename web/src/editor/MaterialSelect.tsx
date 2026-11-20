import { materialKind, type MaterialKind } from '../model/library';
import { addLinearMaterial, addMaterial, useStore } from '../store/store';
import { useState } from 'react';
import { promptDialog } from '../ui/dialogs';
import { useMediaQuery } from '../ui/hooks';
import { ChevronDownIcon } from '../ui/icons';
import { MaterialPickerSheet } from './MaterialPicker';
import styles from './Editor.module.css';
import { useTranslation } from 'react-i18next';

const NEW = '__new__';

/**
 * Picks a material from the library, or creates one. `anyLabel` adds an empty choice
 * (for parts: "any board" / "any bar").
 */
export function MaterialSelect({
  value,
  onChange,
  ariaLabel,
  anyLabel,
  sheet,
  kind = 'sheet',
  stockLength,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  ariaLabel: string;
  anyLabel?: string;
  /** Sheet size for a new sheet material's per-sheet price. */
  sheet?: { length: number; width: number };
  /** Material kind offered by this selector. */
  kind?: MaterialKind;
  /** Bar length for a new linear material's per-piece price. */
  stockLength?: number;
}) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const filtered = materials.filter((m) => materialKind(m) === kind);
  const known = value === null || filtered.some((m) => m.id === value);
  const phone = useMediaQuery('(max-width: 767px)');
  const [picking, setPicking] = useState(false);

  const createNew = async (): Promise<string | null> => {
    const name = await promptDialog({
      title: t('New material'),
      label:
        kind === 'linear'
          ? t('Name of the new linear stock, e.g. “KVH 45x95”')
          : t('Name of the new material, e.g. “DTD White 18mm”'),
      confirmLabel: t('Add'),
    });
    if (!name) return null;
    return kind === 'linear'
      ? addLinearMaterial(name, stockLength ? { stockLength } : undefined).id
      : addMaterial(name, sheet).id;
  };

  if (phone) {
    const current = filtered.find((m) => m.id === value) ?? materials.find((m) => m.id === value);
    const name =
      current?.name ?? (known ? (anyLabel ?? t('Choose material…')) : t('Deleted material'));
    return (
      <>
        <button
          type="button"
          className={styles.picker}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${name}`}
          onClick={() => setPicking(true)}
        >
          <span
            className={styles.pickerSwatch}
            style={current ? { background: current.color } : undefined}
            aria-hidden="true"
          />
          <span className={styles.pickerName}>{name}</span>
          <ChevronDownIcon size={20} />
        </button>
        {picking && (
          <MaterialPickerSheet
            title={t('Material')}
            value={value}
            anyLabel={anyLabel}
            sheet={sheet}
            kind={kind}
            stockLength={stockLength}
            onPick={onChange}
            onClose={() => setPicking(false)}
          />
        )}
      </>
    );
  }
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
        const id = await createNew();
        if (id) onChange(id);
      }}
    >
      {(anyLabel || value === null) && (
        <option value="">{anyLabel ?? t('Choose material…')}</option>
      )}
      {!known && <option value={value ?? ''}>{t('Deleted material')}</option>}
      {filtered.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      <option value={NEW}>{t('+ New material…')}</option>
    </select>
  );
}
