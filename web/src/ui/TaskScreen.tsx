// A full-screen task on a phone (add a part, print labels): a back arrow and title on top, the
// form in the middle, one big action at the bottom. The bottom bar is hidden meanwhile.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon } from './icons';
import styles from './TaskScreen.module.css';

export function TaskScreen({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** The buttons pinned to the bottom. */
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button
          type="button"
          className={styles.back}
          aria-label={t('Back')}
          onClick={() => history.back()}
        >
          <ChevronLeftIcon size={24} />
        </button>
        <div className={styles.titles}>
          <h1>{title}</h1>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </header>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}
