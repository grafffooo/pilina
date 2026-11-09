// A text field with a styled list of suggestions (in place of the browser's <datalist>).
// You can type anything; the list only offers known values. The list is rendered in <body>
// with fixed positioning, so scrolling tables can't clip it.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ui.module.css';

interface ComboInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}

export function ComboInput({
  value,
  onChange,
  options,
  className,
  placeholder,
  'aria-label': ariaLabel,
}: ComboInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  // Every option while the field is empty or holds one of them; otherwise the ones that match.
  const q = value.trim().toLowerCase();
  const shown =
    !q || options.some((o) => o.toLowerCase() === q)
      ? options
      : options.filter((o) => o.toLowerCase().includes(q));
  const visible = open && shown.length > 0;

  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      const el = list.current;
      if (!r || !el) return;
      const gap = 4;
      const below = r.bottom + gap + el.offsetHeight <= window.innerHeight - 8;
      el.style.top = below
        ? `${r.bottom + gap}px`
        : `${Math.max(8, r.top - gap - el.offsetHeight)}px`;
      el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8))}px`;
      el.style.minWidth = `${r.width}px`;
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [visible, shown.length]);

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
    setActive(-1);
  };

  return (
    <>
      <input
        ref={input}
        className={className}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={id}
        aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) setOpen(true);
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((a) => (shown.length ? (a + step + shown.length) % shown.length : -1));
          } else if (e.key === 'Enter' && visible && active >= 0) {
            e.preventDefault();
            pick(shown[active]!);
          } else if (e.key === 'Escape' && visible) {
            e.stopPropagation();
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {visible &&
        createPortal(
          <ul ref={list} id={id} role="listbox" aria-label={ariaLabel} className={styles.listbox}>
            {shown.map((o, i) => (
              <li
                key={o}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                // Keep focus in the field, so the choice lands before blur closes the list.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onPointerEnter={() => setActive(i)}
              >
                {o}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
