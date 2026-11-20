// Re-optimizes the open project shortly after every change that affects the cut.
import { useEffect, useMemo } from 'react';
import { CANCELLED, optimize, reorderPlan } from '../engine/client';
import type { Job } from '../engine/types';
import { jobKey, projectToJob, resolveTransportProfile } from '../model/job';
import { matchingOffcuts, offcutStock } from '../model/offcut';
import { useCurrentProject, useStore } from '../store/store';
import { useView } from '../store/view';
import { syncProjectSummary } from './projectSummary';

const DEBOUNCE_MS = 200;

export function useOptimizer() {
  const project = useCurrentProject();
  const id = project?.id;
  const parts = project?.parts;
  const stock = project?.stock;
  const kerf = project?.kerf;
  const trim = project?.trim;
  const transportId = project?.transportId;
  const storeKerf = project?.storeKerf;
  const materials = useStore((s) => s.materials);
  const library = useStore((s) => s.offcuts);
  const useOffcuts = project?.useOffcuts;
  const cutOrder = useStore((s) => s.settings.cutOrder);
  const settings = useStore((s) => s.settings);

  const profile = project ? resolveTransportProfile(project, settings) : null;
  const transport = profile
    ? {
        maxLength: profile.maxLength,
        maxWidth: profile.maxWidth,
        storeKerf: storeKerf ?? settings.storeKerf ?? 4.5,
      }
    : undefined;

  // Only the fields that change the layout; renaming a project or switching cut order doesn't re-run the search.
  const baseJob = useMemo(
    () =>
      project
        ? projectToJob(
            project,
            materials,
            offcutStock(matchingOffcuts(project, library), materials),
            { transport },
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, parts, stock, kerf, trim, transportId, storeKerf, materials, library, useOffcuts, settings.transportProfiles, settings.storeKerf],
  );
  const key = jobKey(baseJob);

  // A different project starts on its first sheet.
  useEffect(() => {
    useView.getState().setSheet(0);
  }, [id]);

  useEffect(() => {
    const { setResult } = useStore.getState();
    if (!baseJob || !id) {
      setResult({ status: 'empty', plan: null, job: null, error: null });
      if (id) syncProjectSummary(id);
      return;
    }
    let stale = false;
    setResult({ status: 'running' });
    const timer = setTimeout(() => {
      const initialOrder = useStore.getState().settings.cutOrder;
      const job: Job = {
        ...baseJob,
        options: { timeBudgetMs: 600, seed: 1234567, ...baseJob.options, cutOrder: initialOrder },
      };
      optimize(job)
        .then(async (plan) => {
          if (stale || plan === CANCELLED) return;
          const latestOrder = useStore.getState().settings.cutOrder;
          const finalPlan =
            latestOrder === initialOrder ? plan : await reorderPlan(plan, latestOrder);
          if (stale) return;
          const finalJob: Job =
            latestOrder === initialOrder
              ? job
              : {
                  ...job,
                  options: {
                    timeBudgetMs: 600,
                    seed: 1234567,
                    ...job.options,
                    cutOrder: latestOrder,
                  },
                };
          setResult({ status: 'ready', plan: finalPlan, job: finalJob, error: null });
          const view = useView.getState();
          if (view.sheet >= finalPlan.sheets.length) view.setSheet(0);
          syncProjectSummary(id);
        })
        .catch((e: unknown) => {
          if (!stale) setResult({ status: 'error', error: String(e) });
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // `key` captures everything in `baseJob`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, id]);

  // Renumber existing layouts immediately when Cut order changes without re-optimizing.
  useEffect(() => {
    const { result, setResult } = useStore.getState();
    if (
      result.status !== 'ready' ||
      !result.plan ||
      !result.job ||
      result.job.options?.cutOrder === cutOrder
    ) {
      return;
    }
    let stale = false;
    const planJob = result.job;
    const nextJob: Job = {
      ...planJob,
      options: { timeBudgetMs: 600, seed: 1234567, ...planJob.options, cutOrder },
    };
    reorderPlan(result.plan, cutOrder)
      .then((plan) => {
        if (stale) return;
        const cur = useStore.getState().result;
        if (cur.status !== 'ready' || cur.job !== planJob) return;
        setResult({ status: 'ready', plan, job: nextJob, error: null });
      })
      .catch((e: unknown) => {
        if (!stale) setResult({ status: 'error', error: String(e) });
      });
    return () => {
      stale = true;
    };
  }, [cutOrder]);
}
