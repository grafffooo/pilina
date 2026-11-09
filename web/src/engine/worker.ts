// Runs the Rust engine (WebAssembly) off the main thread so long optimizations never freeze the UI.
import * as Comlink from 'comlink';
import init, { optimize as wasmOptimize, version as wasmVersion } from './pkg/cutlist.js';
import type { Job, Plan, Progress } from './types';

const ready = init();

const api = {
  async version(): Promise<string> {
    await ready;
    return wasmVersion();
  },
  /**
   * Optimizes a job. `onProgress` (wrap it in `Comlink.proxy`) is called after each search
   * pass. To cancel a running search, terminate the worker.
   */
  async optimize(job: Job, onProgress?: (p: Progress) => void): Promise<Plan> {
    await ready;
    // The proxied callback is async, so its return value can't stop the search.
    const report = onProgress ? (p: Progress) => void onProgress(p) : undefined;
    return wasmOptimize(job, report) as Plan;
  },
};

export type EngineApi = typeof api;

Comlink.expose(api);
