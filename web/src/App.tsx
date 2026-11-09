// Milestone 0 shell: proves the PWA, design tokens and the Rust engine (in a worker) are wired up.
// The real workspace UI arrives in milestone 2.
import { useEffect, useState } from 'react';
import { engine } from './engine/client';
import type { Job, Plan } from './engine/types';
import styles from './App.module.css';

const SAMPLE_JOB: Job = {
  parts: [
    { id: 'sides', length: 1000, width: 300, qty: 2, label: 'Sides' },
    { id: 'shelves', length: 764, width: 300, qty: 10, label: 'Shelves and T/B' },
    { id: 'stretchers', length: 764, width: 80, qty: 2, label: 'Stretchers' },
  ],
  stock: [{ id: 'dtd', length: 2800, width: 2070, priority: true, label: 'DTD Black 18mm' }],
  kerf: 4,
};

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; version: string; plan: Plan }
  | { kind: 'error'; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([engine.version(), engine.optimize(SAMPLE_JOB)])
      .then(([version, plan]) => !cancelled && setStatus({ kind: 'ready', version, plan }))
      .catch((e: unknown) => !cancelled && setStatus({ kind: 'error', message: String(e) }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.brand}>
        <img src="/icon.svg" alt="" width={40} height={40} />
        <h1>CutList</h1>
      </header>
      <section className={styles.card} aria-live="polite">
        <h2>Engine check</h2>
        {status.kind === 'loading' && <p>Starting the cutting engine…</p>}
        {status.kind === 'error' && (
          <p className={styles.error}>Engine failed to start: {status.message}</p>
        )}
        {status.kind === 'ready' && (
          <>
            <p>
              Rust engine <strong>v{status.version}</strong> is running in a background worker.
            </p>
            <p className={styles.muted}>
              Sample job: {status.plan.unplaced.reduce((n, u) => n + u.count, 0)} parts sent,{' '}
              {status.plan.sheets.length} sheets back. The optimizer itself arrives in milestone 1.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
