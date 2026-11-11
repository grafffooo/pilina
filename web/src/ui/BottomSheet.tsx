// A sheet that slides up from the bottom on a phone: a dimmed page behind, a grab handle, a title
// with a 44 px close button, then the content. Back (or Escape, or a tap outside) closes it.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from './icons';
import { useHistoryLayer } from './useHistoryLayer';
import styles from './BottomSheet.module.css';

export function BottomSheet({
  title,
  hint,
  onClose,
  children,
  footer,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the content, such as a primary button. */
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const sheet = useRef<HTMLDivElement>(null);
  useHistoryLayer(true, onClose);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>('input, select, button[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
    // onClose changes every render; only the open and close of the sheet matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className={styles.backdrop}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={sheet} className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <span className={styles.grab} aria-hidden="true" />
        <div className={styles.head}>
          <div className={styles.titles}>
            <h2>{title}</h2>
            {hint && <span>{hint}</span>}
          </div>
          <button type="button" className={styles.close} aria-label={t('Close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className={styles.content}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
