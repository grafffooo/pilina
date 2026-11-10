// Where a project stands: still being planned, partly cut in cut mode, or cut.
// Nothing new is stored: "cut" is the project's `cutAt`, "cutting" is a cut mode session
// that has started but not finished.
import { steps, type CutSession } from '../cutting/session';
import type { Project } from './project';

export type ProjectStatus =
  | { kind: 'draft' }
  | { kind: 'cutting'; done: number; total: number }
  | { kind: 'cut'; at: number };

export function projectStatus(
  project: Pick<Project, 'cutAt'>,
  session: Pick<CutSession, 'plan' | 'sheet' | 'cut' | 'startedAt'> | null,
): ProjectStatus {
  if (session) {
    const total = steps(session.plan).length;
    const started = session.sheet > 0 || session.cut > 0;
    // A session begun after the project was marked cut is a new round of cutting.
    const current = project.cutAt === null || session.startedAt > project.cutAt;
    if (started && current && session.sheet < total) {
      return { kind: 'cutting', done: session.sheet, total };
    }
  }
  return project.cutAt !== null ? { kind: 'cut', at: project.cutAt } : { kind: 'draft' };
}
