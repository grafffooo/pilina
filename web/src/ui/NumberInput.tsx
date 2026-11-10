// Text input for numbers (and, through LengthInput, sizes). Keeps what the user types ("18," mid-edit) while
// committing every parseable value, and follows outside changes such as undo.
import { useState, type InputHTMLAttributes } from 'react';
import { currentUnit, formatLength, isImperial, parseLength } from '../lib/units';
import { parseNumber } from '../model/paste';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null;
  onCommit: (value: number | null) => void;
  /** Text shown for `null`, e.g. "∞" for unlimited quantity. */
  emptyText?: string;
  /** Text to number (default: a plain decimal number). */
  parse?: (text: string) => number | null;
  /** Number to text (default: as is). */
  format?: (value: number) => string;
};

export function NumberInput({
  value,
  onCommit,
  emptyText = '',
  onBlur,
  parse = parseNumber,
  format = String,
  ...rest
}: Props) {
  const display = (v: number | null) => (v === null ? emptyText : format(v));
  const [draft, setDraft] = useState(() => display(value));
  const [synced, setSynced] = useState(value);

  // An outside change (undo, paste, another control) replaces the draft.
  if (value !== synced) {
    setSynced(value);
    if (parse(draft) !== value) setDraft(display(value));
  }

  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      {...rest}
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = text.trim() === emptyText && emptyText !== '' ? null : parse(text);
        if (n !== value && (n !== null || text.trim() === '' || text.trim() === emptyText)) {
          setSynced(n);
          onCommit(n);
        }
      }}
      onBlur={(e) => {
        setDraft(display(value));
        onBlur?.(e);
      }}
    />
  );
}

/** A size in the workshop's unit (mm, cm or inches), committed in millimetres. */
export function LengthInput(props: Omit<Props, 'parse' | 'format' | 'inputMode'>) {
  const imperial = isImperial();
  return (
    <NumberInput
      // A new unit starts the field afresh, showing the value in that unit.
      key={currentUnit()}
      {...props}
      // Fractions need a space and a slash, which the decimal keypad doesn't have.
      inputMode={imperial ? 'text' : 'decimal'}
      // Lets tables give fractions ("110 15/16") room.
      data-unit={currentUnit()}
      parse={(text) => parseLength(text)}
      format={(mm) => formatLength(mm)}
    />
  );
}
