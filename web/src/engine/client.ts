// Main-thread handle to the single engine worker. Newer optimization calls signal
// cooperative cancellation (when SharedArrayBuffer is available) and queue at most one latest
// job per queue (2D sheets and 1D linear stock stay independent) on one warm worker.
import * as Comlink from 'comlink';
import type { EngineApi } from './worker';
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

let worker: Worker;
let api: Comlink.Remote<EngineApi>;
const resetHooks: (() => void)[] = [];

function spawn() {
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  api = Comlink.wrap<EngineApi>(worker);
}
spawn();

function respawnWorker() {
  worker.terminate();
  spawn();
  for (const reset of resetHooks) reset();
}

export const CANCELLED = Symbol('cancelled');

const canShareCancel = () =>
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof crossOriginIsolated !== 'undefined' &&
  crossOriginIsolated;

function createOptimizerQueue<J extends { options?: { timeBudgetMs?: number } }, P>(
  run: (job: J, progress?: (p: Progress) => void, cancel?: Int32Array) => Promise<P>,
  defaultBudgetMs: number,
) {
  interface Pending {
    gen: number;
    job: J;
    onProgress?: (p: Progress) => void;
    resolve: (value: P | typeof CANCELLED) => void;
    reject: (err: unknown) => void;
  }

  let latestGen = 0;
  let inFlight: {
    gen: number;
    cancelBuf: Int32Array | null;
    abort: () => void;
  } | null = null;
  let queued: Pending | null = null;

  function drain() {
    if (inFlight || !queued) return;
    const next = queued;
    queued = null;
    startRun(next);
  }

  function startRun(req: Pending) {
    const cancelBuf = canShareCancel() ? new Int32Array(new SharedArrayBuffer(4)) : null;
    let done = false;
    const finish = () => {
      if (done) return false;
      done = true;
      clearTimeout(timer);
      inFlight = null;
      return true;
    };
    const settleFailure = (err: unknown) => {
      if (!finish()) return;
      if (req.gen !== latestGen) req.resolve(CANCELLED);
      else req.reject(err);
      drain();
    };
    const timeoutMs = (req.job.options?.timeBudgetMs ?? defaultBudgetMs) + 3000;
    const timer = setTimeout(() => {
      if (done) return;
      respawnWorker();
    }, timeoutMs);

    inFlight = {
      gen: req.gen,
      cancelBuf,
      abort: () => settleFailure(new Error('Optimization timed out')),
    };
    const progress = req.onProgress ? Comlink.proxy(req.onProgress) : undefined;
    run(req.job, progress, cancelBuf ?? undefined).then(
      (plan) => {
        if (!finish()) return;
        req.resolve(req.gen !== latestGen ? CANCELLED : plan);
        drain();
      },
      settleFailure,
    );
  }

  resetHooks.push(() => inFlight?.abort());

  return (job: J, onProgress?: (p: Progress) => void): Promise<P | typeof CANCELLED> => {
    const gen = ++latestGen;
    return new Promise((resolve, reject) => {
      const req: Pending = { gen, job, onProgress, resolve, reject };
      if (inFlight) {
        if (queued) queued.resolve(CANCELLED);
        queued = req;
        if (inFlight.cancelBuf) Atomics.store(inFlight.cancelBuf, 0, 1);
        return;
      }
      startRun(req);
    });
  };
}

export function engineVersion(): Promise<string> {
  return api.version();
}

/** Optimizes a 2D sheet `job`; resolves to `CANCELLED` if a newer call replaced it. */
export const optimize = createOptimizerQueue<Job, Plan>(
  (job, progress, cancel) => api.optimize(job, progress, cancel),
  600,
);

/** Optimizes a 1D linear `job`; resolves to `CANCELLED` if a newer call replaced it. */
export const optimizeLinear = createOptimizerQueue<LinearJob, LinearPlan>(
  (job, progress, cancel) => api.optimizeLinear(job, progress, cancel),
  200,
);

/** Renumbers cuts for a new `CutOrder` without re-running the search. */
export function reorderPlan(plan: Plan, order: CutOrder): Promise<Plan> {
  return api.reorderPlan(plan, order);
}

export function price(job: Job, plan: Plan, input: PriceInput): Promise<CostBreakdown> {
  return api.price(job, plan, input);
}

export function priceLinear(
  job: LinearJob,
  plan: LinearPlan,
  input: LinearPriceInput,
): Promise<LinearCostBreakdown> {
  return api.priceLinear(job, plan, input);
}
