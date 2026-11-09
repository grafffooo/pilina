// Runs the Rust engine (WebAssembly) off the main thread so long optimizations never freeze the UI.
import * as Comlink from 'comlink';
import init, { optimize as wasmOptimize, version as wasmVersion } from './pkg/cutlist.js';
import type { Job, Plan } from './types';

const ready = init();

const api = {
  async version(): Promise<string> {
    await ready;
    return wasmVersion();
  },
  async optimize(job: Job): Promise<Plan> {
    await ready;
    return wasmOptimize(job) as Plan;
  },
};

export type EngineApi = typeof api;

Comlink.expose(api);
