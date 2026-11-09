import { addMaterial, useStore } from '../store/store';
import styles from './Editor.module.css';

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
  const materials = useStore((s) => s.materials);
  const known = value === null || materials.some((m) => m.id === value);
  return (
    <select
      className={styles.select}
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== NEW) {
          onChange(v || null);
          return;
        }
        const name = window.prompt('Name of the new material, e.g. “DTD White 18mm”')?.trim();
        if (name) onChange(addMaterial(name, sheet).id);
      }}
    >
      {(anyLabel || value === null) && <option value="">{anyLabel ?? 'Choose material…'}</option>}
      {!known && <option value={value ?? ''}>Deleted material</option>}
      {materials.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      <option value={NEW}>+ New material…</option>
    </select>
  );
}
