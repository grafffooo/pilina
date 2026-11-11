// A button that opens a small panel below it. Closes on Escape, outside click, or `close()`.
// The panel is rendered in <body> with fixed positioning, so scrolling table containers
// can't clip it.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BottomSheet } from './BottomSheet';
import { useMediaQuery } from './hooks';
import styles from './ui.module.css';

interface PopoverProps {
  /** Contents of the trigger button. */
  label: ReactNode;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
  triggerClassName?: string;
  align?: 'start' | 'end';
  /** The sheet's title on a phone (the panel is a bottom sheet there); defaults to `ariaLabel`. */
  title?: string;
  children: (close: () => void) => ReactNode;
}

export function Popover({
  label,
  ariaLabel,
  triggerClassName,
  align = 'start',
  title,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const phone = useMediaQuery('(max-width: 767px)');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  // Place the panel under the trigger (or above it near the bottom of the window) and keep
  // it there while the page scrolls.
  useLayoutEffect(() => {
    if (!open || phone) return;
    const place = () => {
      const t = trigger.current?.getBoundingClientRect();
      const el = panel.current;
      if (!t || !el) return;
      const gap = 6;
      const below = t.bottom + gap + el.offsetHeight <= window.innerHeight - 8;
      el.style.top = below
        ? `${t.bottom + gap}px`
        : `${Math.max(8, t.top - gap - el.offsetHeight)}px`;
      const left =
        align === 'end'
          ? t.right - el.offsetWidth
          : Math.min(t.left, window.innerWidth - el.offsetWidth - 8);
      el.style.left = `${Math.max(8, left)}px`;
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align, phone]);

  useEffect(() => {
    if (!open || phone) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
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
  }, [open, phone]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (open && !phone) panel.current?.querySelector<HTMLElement>('input, select, button')?.focus();
  }, [open, phone]);

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
      {open && phone && (
        <BottomSheet title={title ?? ariaLabel ?? ''} onClose={close}>
          {children(close)}
        </BottomSheet>
      )}
      {open &&
        !phone &&
        createPortal(
          <div ref={panel} id={id} className={styles.popover}>
            {children(close)}
          </div>,
          document.body,
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
