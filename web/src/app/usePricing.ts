// Prices both the 2D sheet plan and 1D linear plan whenever they, pricing, or the library change.
import { useEffect } from 'react';
import { price, priceLinear } from '../engine/client';
import { buildLinearPriceInput, buildPriceInput } from '../model/library';
import { useCurrentProject, useStore } from '../store/store';
import { syncProjectSummary } from './projectSummary';

export function usePricing() {
  const project = useCurrentProject();
  const plan = useStore((s) => s.result.plan);
  const job = useStore((s) => s.result.job);
  const linearPlan = useStore((s) => s.linearResult.plan);
  const linearJob = useStore((s) => s.linearResult.job);
  const materials = useStore((s) => s.materials);
  const edgeBands = useStore((s) => s.edgeBands);
  const settings = useStore((s) => s.settings);

  const id = project?.id;
  const pricing = project?.pricing;
  const parts = project?.parts;
  const stock = project?.stock;
  const linearStock = project?.linearStock;
  const defaultBand = project?.defaultEdgeBandId;

  useEffect(() => {
    const { setCost } = useStore.getState();
    if (!project || !plan || !job) {
      setCost(null);
      if (id) syncProjectSummary(id);
      return;
    }
    let stale = false;
    const offcutStock = job.stock.filter((s) => s.offcut);
    const input = buildPriceInput(project, materials, edgeBands, settings, offcutStock, plan.preCuts);
    price(job, plan, input)
      .then((cost) => {
        if (stale) return;
        setCost(cost);
        syncProjectSummary(project.id);
      })
      .catch((e: unknown) => console.error('Pricing failed', e));
    return () => {
      stale = true;
    };
    // Only what changes the price; `project` itself changes on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, plan, job, pricing, parts, stock, defaultBand, materials, edgeBands, settings]);

  useEffect(() => {
    const { setLinearCost } = useStore.getState();
    const hasSheetPlan = Boolean(plan && job);
    if (!project || !linearPlan || !linearJob) {
      setLinearCost(null);
      if (id) syncProjectSummary(id);
      return;
    }
    let stale = false;
    const offcutStock = linearJob.stock.filter((s) => s.offcut);
    const input = buildLinearPriceInput(
      project,
      materials,
      settings,
      offcutStock,
      !hasSheetPlan,
      linearPlan.preCuts,
    );
    priceLinear(linearJob, linearPlan, input)
      .then((linearCost) => {
        if (stale) return;
        setLinearCost(linearCost);
        syncProjectSummary(project.id);
      })
      .catch((e: unknown) => console.error('Linear pricing failed', e));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, plan, job, linearPlan, linearJob, pricing, linearStock, materials, settings]);
}
