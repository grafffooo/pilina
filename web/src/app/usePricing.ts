// Prices the current plan whenever it, the project's pricing or the library changes.
import { useEffect } from 'react';
import { price } from '../engine/client';
import { buildPriceInput } from '../model/library';
import { useCurrentProject, useStore } from '../store/store';

export function usePricing() {
  const project = useCurrentProject();
  const plan = useStore((s) => s.result.plan);
  const job = useStore((s) => s.result.job);
  const materials = useStore((s) => s.materials);
  const edgeBands = useStore((s) => s.edgeBands);
  const settings = useStore((s) => s.settings);

  const id = project?.id;
  const pricing = project?.pricing;
  const parts = project?.parts;
  const stock = project?.stock;
  const defaultBand = project?.defaultEdgeBandId;

  useEffect(() => {
    const { setCost, setSummary } = useStore.getState();
    if (!project || !plan || !job) {
      setCost(null);
      return;
    }
    let stale = false;
    const input = buildPriceInput(project, materials, edgeBands, settings);
    price(job, plan, input)
      .then((cost) => {
        if (stale) return;
        setCost(cost);
        setSummary(project.id, { cost: cost.complete ? cost.total : null });
      })
      .catch((e: unknown) => console.error('Pricing failed', e));
    return () => {
      stale = true;
    };
    // Only what changes the price; `project` itself changes on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, plan, job, pricing, parts, stock, defaultBand, materials, edgeBands, settings]);
}
