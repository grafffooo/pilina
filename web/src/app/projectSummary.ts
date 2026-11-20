// Keeps each project's stored summary (used by the project list & sidebar) in sync with
// both 2D sheet and 1D linear optimizer/pricing results.
import { linearUsedPercent, usedPercent } from '../model/job';
import { useStore } from '../store/store';

export function syncProjectSummary(id: string): void {
  const { currentId, result, linearResult, cost, linearCost, setSummary } = useStore.getState();
  if (currentId !== id) return;

  const sheetPieces = result.job ? result.job.parts.reduce((n, p) => n + p.qty, 0) : 0;
  const linearPieces = linearResult.job
    ? linearResult.job.parts.reduce((n, p) => n + p.qty, 0)
    : 0;
  const pieces = sheetPieces + linearPieces;
  const sheets = result.plan?.totals.sheets ?? 0;
  const bars = linearResult.plan?.totals.bars ?? 0;

  const usedPct =
    result.plan && result.plan.totals.sheetArea > 0
      ? usedPercent(result.plan)
      : linearResult.plan && linearResult.plan.totals.stockLength > 0
        ? linearUsedPercent(linearResult.plan)
        : 0;

  let totalCost: number | null = null;
  if (cost || linearCost) {
    const complete = (cost?.complete ?? true) && (linearCost?.complete ?? true);
    totalCost = complete ? (cost?.total ?? 0) + (linearCost?.total ?? 0) : null;
  }

  setSummary(id, { pieces, sheets, bars, usedPct, cost: totalCost });
}
