// Re-optimizes the open project shortly after every change that affects the cut.
import { useEffect, useMemo } from 'react';
import { CANCELLED, optimize } from '../engine/client';
import { jobKey, projectToJob, usedPercent } from '../model/job';
import { useCurrentProject, useStore } from '../store/store';
import { useView } from '../store/view';

const DEBOUNCE_MS = 200;

export function useOptimizer() {
  const project = useCurrentProject();
  const id = project?.id;
  const parts = project?.parts;
  const stock = project?.stock;
  const kerf = project?.kerf;
  const trim = project?.trim;

  // Only the fields that change the cut; renaming a project doesn't re-run the engine.
  const job = useMemo(
    () => (project ? projectToJob(project) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, parts, stock, kerf, trim],
  );
  const key = jobKey(job);

  // A different project starts on its first sheet.
  useEffect(() => {
    useView.getState().setSheet(0);
  }, [id]);

  useEffect(() => {
    const { setResult, setSummary } = useStore.getState();
    if (!job || !id) {
      setResult({ status: 'empty', plan: null, job: null, error: null });
      return;
    }
    let stale = false;
    setResult({ status: 'running' });
    const timer = setTimeout(() => {
      optimize(job)
        .then((plan) => {
          if (stale || plan === CANCELLED) return;
          setResult({ status: 'ready', plan, job, error: null });
          const view = useView.getState();
          if (view.sheet >= plan.sheets.length) view.setSheet(0);
          setSummary(id, {
            pieces: job.parts.reduce((n, p) => n + p.qty, 0),
            sheets: plan.totals.sheets,
            usedPct: usedPercent(plan),
          });
        })
        .catch((e: unknown) => {
          if (!stale) setResult({ status: 'error', error: String(e) });
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // `key` captures everything in `job`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, id]);
}
