// A project's status (cutting / cut) as a small badge, for the sidebar and the header.
import { useTranslation } from 'react-i18next';
import { peekSession, saveSession } from '../cutting/session';
import { locale } from '../i18n';
import type { Project } from '../model/project';
import { projectStatus, type ProjectStatus } from '../model/status';
import { updateProject, useStore } from '../store/store';
import { CheckIcon, SawIcon } from '../ui/icons';
import styles from './StatusBadge.module.css';

export function useProjectStatus(project: Pick<Project, 'id' | 'cutAt'>): ProjectStatus {
  // Read again when cut mode opens or closes; the session itself lives in localStorage.
  useStore((s) => s.cutting);
  return projectStatus(project, peekSession(project.id));
}

/** Marks the open project as cut, or back to a draft. A half-done cut mode session is
 *  dropped either way: the project is finished, or it's being planned again. */
export function setProjectCut(project: Pick<Project, 'id'>, cut: boolean) {
  saveSession(project.id, null);
  updateProject({ cutAt: cut ? Date.now() : null });
}

export const cutDate = (at: number) =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(at),
  );

/** Draft (quiet beige), cutting (pale blue) or cut (green). `large` sits next to the
 *  project name; the small one in the sidebar. */
export function StatusBadge({ status, large }: { status: ProjectStatus; large?: boolean }) {
  const { t } = useTranslation();
  const size = large ? styles.large : '';
  if (status.kind === 'draft') {
    return <span className={`${styles.badge} ${styles.draft} ${size}`}>{t('Draft')}</span>;
  }
  return status.kind === 'cut' ? (
    <span
      className={`${styles.badge} ${styles.cut} ${size}`}
      title={t('Cut on {{date}}', { date: cutDate(status.at) })}
    >
      <CheckIcon size={large ? 14 : 12} />
      {t('status_cut')}
    </span>
  ) : (
    <span className={`${styles.badge} ${styles.cutting} ${size}`}>
      <SawIcon size={large ? 14 : 12} />
      {t('Cutting {{done}} / {{total}}', { done: status.done, total: status.total })}
    </span>
  );
}
