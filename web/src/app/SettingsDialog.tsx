// App settings in a modal: language and theme for this device, plus the workshop settings
// shared by every project (units, currency, edge band allowance, reusable leftover size).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, loadLanguageChoice, setLanguageChoice, type LanguageChoice } from '../i18n';
import { CURRENCIES, formatMoney } from '../model/library';
import { updateSettings, useStore } from '../store/store';
import { CloseIcon } from '../ui/icons';
import { useNow } from '../ui/hooks';
import { t as i18nT } from '../i18n';
import { allowFolder, linkFolder, syncNow, unlinkFolder, useFolderSync } from '../sync/folderSync';
import { LengthInput } from '../ui/NumberInput';
import { UNITS, unitLabel } from '../lib/units';
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
          <div className={styles.row}>
            <span className={styles.label} id="units-label">
              {t('Units')}
            </span>
            <div className={ui.segmented} role="group" aria-labelledby="units-label">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={settings.units === u}
                  onClick={() => updateSettings({ units: u })}
                >
                  {u === 'mm' ? t('Millimetres') : u === 'cm' ? t('Centimetres') : t('Inches')}
                </button>
              ))}
            </div>
          </div>
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
              <LengthInput
                className={`${ui.fieldInput} ${styles.short}`}
                value={settings.edgeAllowance}
                onCommit={(v) => updateSettings({ edgeAllowance: Math.max(0, v ?? 0) })}
              />
              {t('{{unit}} extra per banded edge', { unit: unitLabel() })}
            </span>
          </label>
          <div className={styles.row}>
            <span className={styles.label}>{t('Reusable leftover')}</span>
            <span className={styles.inline}>
              {t('at least')}
              <LengthInput
                className={`${ui.fieldInput} ${styles.short}`}
                aria-label={t('Minimum leftover length')}
                value={settings.offcutMinLength}
                onCommit={(v) => updateSettings({ offcutMinLength: Math.max(0, v ?? 0) })}
              />
              ×
              <LengthInput
                className={`${ui.fieldInput} ${styles.short}`}
                aria-label={t('Minimum leftover width')}
                value={settings.offcutMinWidth}
                onCommit={(v) => updateSettings({ offcutMinWidth: Math.max(0, v ?? 0) })}
              />
              {unitLabel()}
            </span>
          </div>
        </section>

        <FolderSection />

        <div className={styles.actions}>
          <button type="button" className={ui.buttonPrimary} onClick={onClose}>
            {t('Done')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Linking a folder that a cloud drive keeps in sync. */
function FolderSection() {
  const { t } = useTranslation();
  const sync = useFolderSync();
  const now = useNow(15_000);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(null);
    action()
      .catch((e: unknown) => {
        console.error(e);
        const message = e instanceof Error ? e.message : String(e);
        setFailed(
          /already active/i.test(message)
            ? t(
                'A folder dialog is already open. Choose a folder there or close it, then try again.',
              )
            : t('Couldn’t use that folder: {{error}}', { error: message }),
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className={styles.group} aria-labelledby="settings-folder-h">
      <h3 id="settings-folder-h" className={styles.groupTitle}>
        {t('Cloud folder')}
      </h3>
      {sync.support === null ? (
        <p className={styles.hint}>
          {t(
            'This browser can’t link a folder. Use the Pilina Mac app, or Chrome or Edge on a computer. Projects can still be shared as files.',
          )}
        </p>
      ) : sync.state === 'off' ? (
        <>
          <p className={styles.hint}>
            {t(
              'Keep your projects, materials and prices as files in a folder that iCloud Drive, Google Drive or OneDrive syncs. Every computer linked to the same folder sees the same projects.',
            )}
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={ui.button}
              disabled={busy}
              onClick={() => run(linkFolder)}
            >
              {t('Link a folder…')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.folderLine}>
            <strong>{sync.folderName}</strong>
            <span>
              {sync.state === 'needs-permission'
                ? t('Pilina needs your permission again to use this folder.')
                : sync.state === 'syncing'
                  ? t('Syncing…')
                  : sync.state === 'error'
                    ? t('Couldn’t sync: {{error}}', { error: sync.error })
                    : sync.lastSync
                      ? t('Synced {{when}}', { when: since(sync.lastSync, now) })
                      : ''}
            </span>
          </p>
          {sync.unreadable.length > 0 && (
            <p className={styles.hint}>
              {t('Couldn’t read: {{files}}.', { files: sync.unreadable.join(', ') })}
            </p>
          )}
          <div className={styles.row}>
            {sync.state === 'needs-permission' ? (
              <button
                type="button"
                className={ui.buttonPrimary}
                disabled={busy}
                onClick={() => run(allowFolder)}
              >
                {t('Allow access')}
              </button>
            ) : (
              <button
                type="button"
                className={ui.button}
                disabled={busy || sync.state === 'syncing'}
                onClick={() => run(syncNow)}
              >
                {t('Sync now')}
              </button>
            )}
            <button
              type="button"
              className={ui.button}
              disabled={busy}
              onClick={() => run(unlinkFolder)}
            >
              {t('Unlink')}
            </button>
          </div>
          <p className={styles.hint}>
            {t('Unlinking stops syncing; the folder and its files stay as they are.')}
          </p>
        </>
      )}
      {failed && (
        <p className={styles.failed} role="alert">
          {failed}
        </p>
      )}
    </section>
  );
}

function since(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return i18nT('just now');
  return i18nT('{{count}} min ago', { count: Math.round(s / 60) });
}
