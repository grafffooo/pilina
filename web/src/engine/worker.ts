// Runs the Rust engine (WebAssembly) off the main thread so long optimizations never freeze the UI.
import * as Comlink from 'comlink';
import init, {
  optimize as wasmOptimize,
  optimize_linear as wasmOptimizeLinear,
  price as wasmPrice,
  price_linear as wasmPriceLinear,
  reorder_plan as wasmReorderPlan,
  version as wasmVersion,
} from './pkg/pilina.js';
import type {
  CostBreakdown,
  CutOrder,
  Job,
  LinearCostBreakdown,
  LinearJob,
  LinearPlan,
  LinearPriceInput,
  Plan,
  PriceInput,
  Progress,
} from './types';

const ready = init();

function makeReport(onProgress?: (p: Progress) => void, cancel?: Int32Array) {
  if (!cancel && !onProgress) return undefined;
  return (p: Progress) => {
    if (cancel && Atomics.load(cancel, 0) !== 0) return false;
    if (onProgress) void onProgress(p);
    return true;
  };
}

const api = {
  async version(): Promise<string> {
    await ready;
    return wasmVersion();
  },
  /**
   * Optimizes a 2D sheet job. When `cancel` is a SharedArrayBuffer-backed view, setting
   * `cancel[0]` non-zero stops the search cooperatively after the current pass.
   */
  async optimize(job: Job, onProgress?: (p: Progress) => void, cancel?: Int32Array): Promise<Plan> {
    await ready;
    return wasmOptimize(job, makeReport(onProgress, cancel)) as Plan;
  },
  async optimizeLinear(
    job: LinearJob,
    onProgress?: (p: Progress) => void,
    cancel?: Int32Array,
  ): Promise<LinearPlan> {
    await ready;
    return wasmOptimizeLinear(job, makeReport(onProgress, cancel)) as LinearPlan;
  },
  async reorderPlan(plan: Plan, order: CutOrder): Promise<Plan> {
    await ready;
    return wasmReorderPlan(plan, order) as Plan;
  },
  async price(job: Job, plan: Plan, input: PriceInput): Promise<CostBreakdown> {
    await ready;
    return wasmPrice(job, plan, input) as CostBreakdown;
  },
  async priceLinear(
    job: LinearJob,
    plan: LinearPlan,
    input: LinearPriceInput,
  ): Promise<LinearCostBreakdown> {
    await ready;
    return wasmPriceLinear(job, plan, input) as LinearCostBreakdown;
  },
};

export type EngineApi = typeof api;

Comlink.expose(api);
