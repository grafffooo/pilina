// A row of exclusive choices (Any / Length / Width); wraps the shared `.segmented` styles.
import ui from './ui.module.css';

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  full,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  /** Spread across the full width (phones). */
  full?: boolean;
}) {
  return (
    <div
      className={`${ui.segmented} ${full ? ui.segmentedFull : ''}`}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
