// Main-thread handle to the engine worker. A new `optimize` call cancels the one still
// running by restarting the worker, so results never lag behind the latest edit.
import * as Comlink from 'comlink';
import type { EngineApi } from './worker';
import type { CostBreakdown, Job, Plan, PriceInput, Progress } from './types';

let worker: Worker;
let api: Comlink.Remote<EngineApi>;

function spawn() {
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  api = Comlink.wrap<EngineApi>(worker);
}
spawn();

let running: { cancel: () => void } | null = null;

export const CANCELLED = Symbol('cancelled');

export function engineVersion(): Promise<string> {
  return api.version();
}

/** Optimizes `job`; resolves to `CANCELLED` if a newer call replaced it. */
export async function optimize(
  job: Job,
  onProgress?: (p: Progress) => void,
): Promise<Plan | typeof CANCELLED> {
  if (running) {
    running.cancel();
    worker.terminate();
    spawn();
  }
  let cancel!: () => void;
  const cancelled = new Promise<typeof CANCELLED>((resolve) => {
    cancel = () => resolve(CANCELLED);
  });
  const token = { cancel };
  running = token;
  try {
    const progress = onProgress ? Comlink.proxy(onProgress) : undefined;
    return await Promise.race([api.optimize(job, progress), cancelled]);
  } finally {
    if (running === token) running = null;
  }
}

// Pricing runs on its own worker, which is never restarted, so a new optimization can't
// cancel it.
let pricer: Comlink.Remote<EngineApi> | undefined;

export function price(job: Job, plan: Plan, input: PriceInput): Promise<CostBreakdown> {
  pricer ??= Comlink.wrap<EngineApi>(
    new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  );
  return pricer.price(job, plan, input);
}
