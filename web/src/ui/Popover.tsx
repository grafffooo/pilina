// A button that opens a small panel below it. Closes on Escape, outside click, or `close()`.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './ui.module.css';

interface PopoverProps {
  /** Contents of the trigger button. */
  label: ReactNode;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
  triggerClassName?: string;
  align?: 'start' | 'end';
  children: (close: () => void) => ReactNode;
}

export function Popover({
  label,
  ariaLabel,
  triggerClassName,
  align = 'start',
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (open) {
      root.current
        ?.querySelector<HTMLElement>('[data-popover-panel] input, [data-popover-panel] button')
        ?.focus();
    }
  }, [open]);

  // Looked up by id (not the ref) because `close` is handed to the render function.
  const close = () => {
    setOpen(false);
    document.getElementById(`${id}-trigger`)?.focus();
  };

  return (
    <div className={styles.popoverRoot} ref={root}>
      <button
        ref={trigger}
        id={`${id}-trigger`}
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div id={id} data-popover-panel className={styles.popover} data-align={align}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** "⋯" style menu built on Popover. */
export function Menu({
  label,
  ariaLabel,
  triggerClassName,
  items,
}: {
  label: ReactNode;
  ariaLabel: string;
  triggerClassName?: string;
  items: MenuItem[];
}) {
  return (
    <Popover label={label} ariaLabel={ariaLabel} triggerClassName={triggerClassName} align="end">
      {(close) => (
        <div role="menu" className={styles.menu}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? styles.menuDanger : styles.menuItem}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
