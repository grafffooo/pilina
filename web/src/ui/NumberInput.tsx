// Text input for millimetre values. Keeps what the user types ("18," mid-edit) while
// committing every parseable value, and follows outside changes such as undo.
import { useState, type InputHTMLAttributes } from 'react';
import { parseNumber } from '../model/paste';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null;
  onCommit: (value: number | null) => void;
  /** Text shown for `null`, e.g. "∞" for unlimited quantity. */
  emptyText?: string;
};

const display = (v: number | null, emptyText: string) => (v === null ? emptyText : String(v));

export function NumberInput({ value, onCommit, emptyText = '', onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState(() => display(value, emptyText));
  const [synced, setSynced] = useState(value);

  // An outside change (undo, paste, another control) replaces the draft.
  if (value !== synced) {
    setSynced(value);
    if (parseNumber(draft) !== value) setDraft(display(value, emptyText));
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
        const n = text.trim() === emptyText && emptyText !== '' ? null : parseNumber(text);
        if (n !== value && (n !== null || text.trim() === '' || text.trim() === emptyText)) {
          setSynced(n);
          onCommit(n);
        }
      }}
      onBlur={(e) => {
        setDraft(display(value, emptyText));
        onBlur?.(e);
      }}
    />
  );
}
