// Cutting sessions: frozen copies of the sheet or linear plans plus where you are in them,
// kept on this device so closing the tab (or the phone locking) doesn't lose your place.
import type {
  BarLayout,
  Job,
  LinearJob,
  LinearPlan,
  Plan,
  SheetLayout,
} from '../engine/types';
import { t } from '../i18n';
import { formatLengthUnit } from '../lib/units';
import type { MeasureFrom } from '../model/cutMeasure';

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

export interface LinearCutSession {
  jobKey: string;
  job: LinearJob;
  plan: LinearPlan;
  /** Index into `linearSteps(plan)`. */
  bar: number;
  /** Next cut on that bar (0-based); `cuts.length` means the bar is done. */
  cut: number;
  kept: boolean;
  keptCodes: string[];
  startedAt: number;
}

/** One entry per physical sheet: a layout cut ×3 appears three times. */
export function steps(plan: Plan): { layout: SheetLayout; layoutIndex: number; copy: number }[] {
  return plan.sheets.flatMap((layout, layoutIndex) =>
    Array.from({ length: layout.qty }, (_, copy) => ({ layout, layoutIndex, copy })),
  );
}

/** One entry per physical bar: a bar layout cut ×3 appears three times. */
export function linearSteps(
  plan: LinearPlan,
): { layout: BarLayout; layoutIndex: number; copy: number }[] {
  return plan.bars.flatMap((layout, layoutIndex) =>
    Array.from({ length: layout.qty }, (_, copy) => ({ layout, layoutIndex, copy })),
  );
}

const key = (projectId: string) => `cutlist.cutting.${projectId}`;
const linearKey = (projectId: string) => `cutlist.cutting.linear.${projectId}`;

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

export function loadLinearSession(
  projectId: string,
  jobKey: string,
): LinearCutSession | null {
  try {
    const raw = localStorage.getItem(linearKey(projectId));
    if (!raw) return null;
    const s = JSON.parse(raw) as LinearCutSession;
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

export function peekLinearSession(projectId: string): LinearCutSession | null {
  try {
    const raw = localStorage.getItem(linearKey(projectId));
    return raw ? (JSON.parse(raw) as LinearCutSession) : null;
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

export function saveLinearSession(projectId: string, session: LinearCutSession | null) {
  try {
    if (session) localStorage.setItem(linearKey(projectId), JSON.stringify(session));
    else localStorage.removeItem(linearKey(projectId));
  } catch {
    // Without storage the session still works; it just won't survive a reload.
  }
}

/** What to say for a cut, on screen and read aloud. */
export function cutSentence(axis: 'x' | 'y', pos: number, from: MeasureFrom = 'sheet'): string {
  const p = formatLengthUnit(pos);
  if (from === 'piece') {
    return axis === 'x'
      ? t('{{pos}} from the left edge of the piece', { pos: p })
      : t('{{pos}} from the top edge of the piece', { pos: p });
  }
  return axis === 'x'
    ? t('{{pos}} from the left edge', { pos: p })
    : t('{{pos}} from the top edge', { pos: p });
}

/** What to read aloud for a 1D linear bar cut. */
export function linearCutSentence(fromLastEdge: number, stage: 0 | 1): string {
  const pos = formatLengthUnit(fromLastEdge);
  return stage === 0
    ? t('Trim {{pos}} off the rough end', { pos })
    : t('Set stop block to {{pos}}', { pos });
}
