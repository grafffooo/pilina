// Install, update and offline notices for the installed app (PWA).
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import ui from '../ui/ui.module.css';
import styles from './Pwa.module.css';
import { useTranslation } from 'react-i18next';

/** Shows "ready offline" once, and asks before switching to a new version. */
export function PwaNotices() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (e) => console.warn('Offline support is unavailable', e),
  });

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className={styles.toast} role="status">
      <span>
        {needRefresh
          ? t('A new version of Pilina is ready.')
          : t('Pilina now works offline. Your projects stay on this device.')}
      </span>
      {needRefresh ? (
        <button
          type="button"
          className={ui.buttonPrimary}
          onClick={() => void updateServiceWorker(true)}
        >
          {t('Reload')}
        </button>
      ) : null}
      <button
        type="button"
        className={ui.button}
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        {needRefresh ? t('Later') : t('OK')}
      </button>
    </div>
  );
}

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** "Install app" button, shown only when the browser offers installation. */
export function InstallButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!event) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await event.prompt();
        await event.userChoice;
        setEvent(null);
      }}
    >
      {t('Install Pilina as an app')}
    </button>
  );
}
