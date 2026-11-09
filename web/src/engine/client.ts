// Main-thread handle to the engine worker. Import `engine` and await its methods.
import * as Comlink from 'comlink';
import type { EngineApi } from './worker';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

export const engine = Comlink.wrap<EngineApi>(worker);
