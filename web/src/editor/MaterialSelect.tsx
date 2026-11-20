import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLength, formatLengthUnit } from '../lib/units';
import { materialKind, type Material, type MaterialKind } from '../model/library';
import { useStore } from '../store/store';
import { useMediaQuery } from '../ui/hooks';
import { CheckIcon, ChevronDownIcon, PlusIcon } from '../ui/icons';
import { Popover } from '../ui/Popover';
import styles from './Editor.module.css';
import { MaterialPickerSheet } from './MaterialPicker';
import { NewMaterialModal } from './NewMaterialModal';

function materialTitle(m: Material): string {
  if (materialKind(m) === 'linear') {
    if (m.thickness && m.profileWidth) {
      return `${m.name} · ${formatLength(m.thickness)} × ${formatLengthUnit(m.profileWidth)}`;
    }
    if (m.thickness) return `${m.name} · ${formatLengthUnit(m.thickness)}`;
    return m.name;
  }
  return m.thickness ? `${m.name} · ${formatLengthUnit(m.thickness)}` : m.name;
}

function materialSubtitle(m: Material): string {
  if (materialKind(m) === 'linear') {
    return m.stockLength ? formatLengthUnit(m.stockLength) : '';
  }
  if (m.sheetLength && m.sheetWidth) {
    return `${formatLength(m.sheetLength)} × ${formatLengthUnit(m.sheetWidth)}`;
  }
  return '';
}

/**
 * Picks a material from the library, or creates a new one via the NewMaterialModal.
 */
export function MaterialSelect({
  value,
  onChange,
  ariaLabel,
  sheet,
  kind = 'sheet',
  stockLength,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  ariaLabel: string;
  /** Retained for compatibility; library materials are always listed without an empty option. */
  anyLabel?: string;
  /** Default sheet size for a new sheet material. */
  sheet?: { length: number; width: number };
  /** Material kind offered by this selector. */
  kind?: MaterialKind;
  /** Default bar length for a new linear material. */
  stockLength?: number;
}) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const filtered = materials.filter((m) => materialKind(m) === kind);
  const current = filtered.find((m) => m.id === value) ?? materials.find((m) => m.id === value);
  const known = value === null || Boolean(current);
  const phone = useMediaQuery('(max-width: 767px)');
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);

  const labelText = current?.name ?? (known ? t('Choose material…') : t('Deleted material'));

  if (phone) {
    return (
      <>
        <button
          type="button"
          className={styles.picker}
          aria-haspopup="dialog"
          aria-label={`${ariaLabel}: ${labelText}`}
          onClick={() => setPicking(true)}
        >
          <span
            className={styles.pickerSwatch}
            style={current ? { background: current.color } : undefined}
            aria-hidden="true"
          />
          <span className={styles.pickerName}>{labelText}</span>
          <ChevronDownIcon size={20} />
        </button>
        {picking && (
          <MaterialPickerSheet
            title={t('Material')}
            value={value}
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
    <>
      <Popover
        ariaLabel={`${ariaLabel}: ${labelText}`}
        triggerClassName={styles.materialTrigger}
        label={
          <>
            <span
              className={styles.materialCircle}
              data-none={current ? undefined : ''}
              style={current ? { background: current.color } : undefined}
              aria-hidden="true"
            />
            <span className={styles.materialTriggerName}>{labelText}</span>
            <ChevronDownIcon size={14} />
          </>
        }
      >
        {(close) => (
          <div className={styles.materialMenu} role="listbox" aria-label={ariaLabel}>
            {filtered.map((m) => {
              const selected = m.id === value;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={styles.materialOption}
                  onClick={() => {
                    onChange(m.id);
                    close();
                  }}
                >
                  <span
                    className={styles.materialOptionCircle}
                    style={{ background: m.color }}
                    aria-hidden="true"
                  />
                  <span className={styles.materialOptionText}>
                    <span className={styles.materialOptionTitle}>{materialTitle(m)}</span>
                    {materialSubtitle(m) && (
                      <span className={styles.materialOptionSub}>{materialSubtitle(m)}</span>
                    )}
                  </span>
                  {selected && <CheckIcon size={16} />}
                </button>
              );
            })}
            {filtered.length > 0 && <div className={styles.materialMenuDivider} />}
            <button
              type="button"
              className={styles.materialAddBtn}
              onClick={() => {
                close();
                setCreating(true);
              }}
            >
              <PlusIcon size={16} />
              {kind === 'linear' ? t('Add linear stock') : t('+ New material…')}
            </button>
          </div>
        )}
      </Popover>
      {creating && (
        <NewMaterialModal
          kind={kind}
          sheet={sheet}
          stockLength={stockLength}
          onCreated={(id) => onChange(id)}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
