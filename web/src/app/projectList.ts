// What the sidebar (desktop) and the Projects screens (phone) share: searching the projects,
// splitting them into open and cut ones, and the short date texts.
import { useMemo } from 'react';
import { peekSession } from '../cutting/session';
import { locale, t as i18nT } from '../i18n';
import type { Project } from '../model/project';
import { projectStatus, type ProjectStatus } from '../model/status';
import { useStore } from '../store/store';

const dayFormat = () =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = () => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });

/** "Today, 14:05", "Yesterday, 09:30" or the date. */
export function when(ts: number, now: number): string {
  const d = new Date(ts);
  const today = new Date(now);
  const time = timeFormat().format(d);
  if (d.toDateString() === today.toDateString()) return i18nT('Today, {{time}}', { time });
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return i18nT('Yesterday, {{time}}', { time });
  return dayFormat().format(d);
}

/** "just now", "5 min ago" or the time. */
export function ago(ts: number | null, now: number): string {
  if (ts === null) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return i18nT('just now');
  const m = Math.round(s / 60);
  return m < 60 ? i18nT('{{count}} min ago', { count: m }) : timeFormat().format(new Date(ts));
}

export interface ProjectRowData {
  project: Project;
  status: ProjectStatus;
  /** The project that is open. */
  active: boolean;
}

/** The projects matching a search (by name or part label), newest first, as open and cut rows. */
export function useProjectRows(query: string) {
  const projects = useStore((s) => s.projects);
  const currentId = useStore((s) => s.currentId);
  const view = useStore((s) => s.view);
  // Statuses come from cut mode sessions too; read them again when cut mode closes.
  const cutting = useStore((s) => s.cutting);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.parts.some((r) => r.label.toLowerCase().includes(q)),
    );
  }, [projects, query]);

  // Projects still being planned or cut on top; finished ones in a "Cut" group below.
  const [open, cut] = useMemo(() => {
    void cutting;
    const rows: ProjectRowData[] = shown.map((project) => ({
      project,
      status: projectStatus(project, peekSession(project.id)),
      active: project.id === currentId && view === 'project',
    }));
    return [
      rows.filter((r) => r.status.kind !== 'cut'),
      rows.filter((r) => r.status.kind === 'cut'),
    ];
  }, [shown, cutting, currentId, view]);

  return { shown, open, cut, currentId };
}
