// Settings as a phone screen (the dialog is for larger screens): a back arrow, then the same form.
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon } from '../ui/icons';
import { SettingsForm } from './SettingsDialog';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
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
        <h1>{t('Settings')}</h1>
      </header>
      <div className={styles.body}>
        <SettingsForm />
      </div>
    </div>
  );
}
