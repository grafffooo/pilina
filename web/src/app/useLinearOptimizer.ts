// Re-optimizes the open project's 1D linear stock shortly after any linear edit.
import { useEffect, useMemo } from 'react';
import { CANCELLED, optimizeLinear } from '../engine/client';
import { linearJobKey, projectToLinearJob, resolveTransportProfile } from '../model/job';
import { linearOffcutStock, matchingLinearOffcuts } from '../model/offcut';
import { useCurrentProject, useStore } from '../store/store';
import { useView } from '../store/view';
import { syncProjectSummary } from './projectSummary';

const DEBOUNCE_MS = 200;

export function useLinearOptimizer() {
  const project = useCurrentProject();
  const id = project?.id;
  const linearParts = project?.linearParts;
  const linearStock = project?.linearStock;
  const linearKerf = project?.linearKerf;
  const linearEndTrim = project?.linearEndTrim;
  const transportId = project?.transportId;
  const storeKerf = project?.storeKerf;
  const useOffcuts = project?.useOffcuts;
  const materials = useStore((s) => s.materials);
  const library = useStore((s) => s.offcuts);
  const settings = useStore((s) => s.settings);

  const profile = project ? resolveTransportProfile(project, settings) : null;
  const transport = profile
    ? {
        maxLength: profile.maxBarLength ?? profile.maxLength,
        storeKerf: storeKerf ?? settings.storeKerf ?? 4.5,
      }
    : undefined;

  const baseJob = useMemo(
    () =>
      project
        ? projectToLinearJob(
            project,
            materials,
            linearOffcutStock(matchingLinearOffcuts(project, library), materials),
            { transport },
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, linearParts, linearStock, linearKerf, linearEndTrim, transportId, storeKerf, materials, library, useOffcuts, settings.transportProfiles, settings.storeKerf],
  );
  const key = linearJobKey(baseJob);

  useEffect(() => {
    useView.getState().setBar(0);
  }, [id]);

  useEffect(() => {
    const { setLinearResult } = useStore.getState();
    if (!baseJob || !id) {
      setLinearResult({ status: 'empty', plan: null, job: null, error: null });
      if (id) syncProjectSummary(id);
      return;
    }
    let stale = false;
    setLinearResult({ status: 'running' });
    const timer = setTimeout(() => {
      optimizeLinear(baseJob)
        .then((plan) => {
          if (stale || plan === CANCELLED) return;
          setLinearResult({ status: 'ready', plan, job: baseJob, error: null });
          const view = useView.getState();
          if (view.bar >= plan.bars.length) view.setBar(0);
          syncProjectSummary(id);
        })
        .catch((e: unknown) => {
          if (!stale) setLinearResult({ status: 'error', error: String(e) });
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // `key` captures everything in `baseJob`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, id]);
}
