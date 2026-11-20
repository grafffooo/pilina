import { hasLinearContent } from '../model/project';
import { useCurrentProject, useStore } from '../store/store';
import { useView, type ActiveKind } from '../store/view';
import { PlayIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import styles from './CutMode.module.css';
import { useTranslation } from 'react-i18next';

/** Opens cut mode for the active sheet or linear plan. */
export function StartCuttingButton({ large, kind }: { large?: boolean; kind?: ActiveKind }) {
  const { t } = useTranslation();
  const project = useCurrentProject();
  const activeKind = useView((s) => s.activeKind);
  const targetKind: ActiveKind =
    kind ?? (project && hasLinearContent(project) ? activeKind : 'sheets');
  const ready = useStore((s) =>
    targetKind === 'linear'
      ? s.linearResult.status === 'ready' && (s.linearResult.plan?.bars.length ?? 0) > 0
      : s.result.status === 'ready' && (s.result.plan?.sheets.length ?? 0) > 0,
  );
  const cut = project?.cutAt != null;
  return (
    <button
      type="button"
      className={large ? styles.startLarge : `${ui.buttonPrimary} ${styles.start}`}
      disabled={!ready}
      title={ready ? undefined : t('Available once the plan is up to date')}
      onClick={() => useStore.getState().setCutting(true, targetKind)}
    >
      <PlayIcon size={16} />
      {cut ? t('Cut again') : t('Start cutting')}
    </button>
  );
}
