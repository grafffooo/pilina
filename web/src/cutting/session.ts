// A cutting session: a frozen copy of the plan plus where you are in it, kept on this
// device so closing the tab (or the phone locking) doesn't lose your place.
import type { Job, Plan, SheetLayout } from '../engine/types';
import { t } from '../i18n';
import { formatLengthUnit } from '../lib/units';

export interface CutSession {
  /** Identity of the job the plan was made for; a changed project starts a new session. */
  jobKey: string;
  job: Job;
  plan: Plan;
  /** Index into `steps(plan)`. */
  sheet: number;
  /** Next cut to make on that sheet (0-based); `cuts.length` means the sheet is done. */
  cut: number;
  /** The sheet's keep-offcuts step was answered. */
  kept: boolean;
  /** Offcut codes kept during this session, for the summary. */
  keptCodes: string[];
  startedAt: number;
}

/** One entry per physical sheet: a layout cut ×3 appears three times. */
export function steps(plan: Plan): { layout: SheetLayout; layoutIndex: number; copy: number }[] {
  return plan.sheets.flatMap((layout, layoutIndex) =>
    Array.from({ length: layout.qty }, (_, copy) => ({ layout, layoutIndex, copy })),
  );
}

const key = (projectId: string) => `cutlist.cutting.${projectId}`;

export function loadSession(projectId: string, jobKey: string): CutSession | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    const s = JSON.parse(raw) as CutSession;
    return s.jobKey === jobKey ? s : null;
  } catch {
    return null;
  }
}

/** The saved session whatever job it was for, to show how far the cutting got. */
export function peekSession(projectId: string): CutSession | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    return raw ? (JSON.parse(raw) as CutSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(projectId: string, session: CutSession | null) {
  try {
    if (session) localStorage.setItem(key(projectId), JSON.stringify(session));
    else localStorage.removeItem(key(projectId));
  } catch {
    // Without storage the session still works; it just won't survive a reload.
  }
}

/** What to say for a cut, on screen and read aloud. */
export function cutSentence(axis: 'x' | 'y', pos: number): string {
  return axis === 'x'
    ? t('{{pos}} from the left edge', { pos: formatLengthUnit(pos) })
    : t('{{pos}} from the top edge', { pos: formatLengthUnit(pos) });
}
