import { useCurrentProject, useStore } from '../store/store';
import { PlayIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import styles from './CutMode.module.css';
import { useTranslation } from 'react-i18next';

/** Opens cut mode for the current, up-to-date plan. */
export function StartCuttingButton({ large }: { large?: boolean }) {
  const { t } = useTranslation();
  const ready = useStore(
    (s) => s.result.status === 'ready' && (s.result.plan?.sheets.length ?? 0) > 0,
  );
  const cut = useCurrentProject()?.cutAt != null;
  return (
    <button
      type="button"
      className={large ? styles.startLarge : `${ui.buttonPrimary} ${styles.start}`}
      disabled={!ready}
      title={ready ? undefined : t('Available once the plan is up to date')}
      onClick={() => useStore.getState().setCutting(true)}
    >
      <PlayIcon size={16} />
      {cut ? t('Cut again') : t('Start cutting')}
    </button>
  );
}
