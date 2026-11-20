// Where a project stands: still being planned, partly cut in cut mode, or cut.
// Nothing new is stored: "cut" is the project's `cutAt`, "cutting" is a cut mode session
// that has started but not finished.
import {
  linearSteps,
  steps,
  type CutSession,
  type LinearCutSession,
} from '../cutting/session';
import type { Project } from './project';

export type ProjectStatus =
  | { kind: 'draft' }
  | { kind: 'cutting'; done: number; total: number }
  | { kind: 'cut'; at: number };

export function projectStatus(
  project: Pick<Project, 'cutAt'>,
  session: Pick<CutSession, 'plan' | 'sheet' | 'cut' | 'startedAt'> | null,
  linearSession: Pick<LinearCutSession, 'plan' | 'bar' | 'cut' | 'startedAt'> | null = null,
): ProjectStatus {
  const sheetTotal = session ? steps(session.plan).length : 0;
  const sheetActive = Boolean(
    session &&
      (session.sheet > 0 || session.cut > 0) &&
      (project.cutAt === null || session.startedAt > project.cutAt) &&
      session.sheet < sheetTotal,
  );
  const linearTotal = linearSession ? linearSteps(linearSession.plan).length : 0;
  const linearActive = Boolean(
    linearSession &&
      (linearSession.bar > 0 || linearSession.cut > 0) &&
      (project.cutAt === null || linearSession.startedAt > project.cutAt) &&
      linearSession.bar < linearTotal,
  );
  if (sheetActive || linearActive) {
    return {
      kind: 'cutting',
      done: (sheetActive ? session!.sheet : 0) + (linearActive ? linearSession!.bar : 0),
      total: (sheetActive ? sheetTotal : 0) + (linearActive ? linearTotal : 0),
    };
  }
  return project.cutAt !== null ? { kind: 'cut', at: project.cutAt } : { kind: 'draft' };
}
