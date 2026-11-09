// App settings in a modal: language and theme for this device, plus the workshop settings
// shared by every project (currency, edge band allowance, reusable leftover size).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, loadLanguageChoice, setLanguageChoice, type LanguageChoice } from '../i18n';
import { CURRENCIES, formatMoney } from '../model/library';
import { updateSettings, useStore } from '../store/store';
import { CloseIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import ui from '../ui/ui.module.css';
import { loadAppearance, saveAppearance, type Theme } from './appearance';
import styles from './SettingsDialog.module.css';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useStore((s) => s.settings);
  const [appearance, setAppearance] = useState(loadAppearance);
  const [language, setLanguage] = useState(loadLanguageChoice);
  const dialog = useRef<HTMLDivElement>(null);
  // The latest onClose, so the effect below runs only on open and close.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('select, button, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  const setTheme = (theme: Theme) => {
    const next = { ...appearance, theme };
    setAppearance(next);
    saveAppearance(next);
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-h"
      >
        <div className={styles.head}>
          <h2 id="settings-h">{t('Settings')}</h2>
          <button type="button" className={ui.iconButton} aria-label={t('Close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <section className={styles.group} aria-labelledby="settings-device-h">
          <h3 id="settings-device-h" className={styles.groupTitle}>
            {t('This device')}
          </h3>
          <label className={styles.row}>
            <span className={styles.label}>{t('Language')}</span>
            <select
              className={ui.fieldInput}
              value={language}
              onChange={(e) => {
                const choice = e.target.value as LanguageChoice;
                setLanguage(choice);
                setLanguageChoice(choice);
              }}
            >
              <option value="auto">{t('Same as this device')}</option>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.row}>
            <span className={styles.label} id="theme-label">
              {t('Theme')}
            </span>
            <div className={ui.segmented} role="group" aria-labelledby="theme-label">
              {(['system', 'light', 'dark'] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  aria-pressed={appearance.theme === th}
                  onClick={() => setTheme(th)}
                >
                  {th === 'system' ? t('Auto') : th === 'light' ? t('Light') : t('Dark')}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.group} aria-labelledby="settings-workshop-h">
          <h3 id="settings-workshop-h" className={styles.groupTitle}>
            {t('Workshop')}
          </h3>
          <label className={styles.row}>
            <span className={styles.label}>{t('Currency')}</span>
            <select
              className={ui.fieldInput}
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({formatMoney(1234.5, c)})
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span className={styles.label}>{t('Edge band allowance')}</span>
            <span className={styles.inline}>
              <NumberInput
                className={`${ui.fieldInput} ${styles.short}`}
                value={settings.edgeAllowance}
                onCommit={(v) => updateSettings({ edgeAllowance: Math.max(0, v ?? 0) })}
              />
              {t('mm extra per banded edge')}
            </span>
          </label>
          <div className={styles.row}>
            <span className={styles.label}>{t('Reusable leftover')}</span>
            <span className={styles.inline}>
              {t('at least')}
              <NumberInput
                className={`${ui.fieldInput} ${styles.short}`}
                aria-label={t('Minimum leftover length, mm')}
                value={settings.offcutMinLength}
                onCommit={(v) => updateSettings({ offcutMinLength: Math.max(0, v ?? 0) })}
              />
              ×
              <NumberInput
                className={`${ui.fieldInput} ${styles.short}`}
                aria-label={t('Minimum leftover width, mm')}
                value={settings.offcutMinWidth}
                onCommit={(v) => updateSettings({ offcutMinWidth: Math.max(0, v ?? 0) })}
              />
              mm
            </span>
          </div>
        </section>

        <div className={styles.actions}>
          <button type="button" className={ui.buttonPrimary} onClick={onClose}>
            {t('Done')}
          </button>
        </div>
      </div>
    </div>
  );
}
