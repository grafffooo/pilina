// Milestone 1 shell: runs the Rust optimizer (in a worker) on a sample job and draws the result.
// The real workspace UI arrives in milestone 2.
import { useEffect, useState } from 'react';
import * as Comlink from 'comlink';
import { engine } from './engine/client';
import type { Job, Plan, Progress, SheetLayout } from './engine/types';
import { formatMetres, formatNumber } from './lib/format';
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
  | { kind: 'ready'; version: string; plan: Plan; ms: number; passes: number }
  | { kind: 'error'; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let passes = 0;
    const onProgress = Comlink.proxy((p: Progress) => {
      passes = p.passes;
    });
    const start = performance.now();
    Promise.all([engine.version(), engine.optimize(SAMPLE_JOB, onProgress)])
      .then(([version, plan]) => {
        if (!cancelled) {
          const ms = performance.now() - start;
          setStatus({ kind: 'ready', version, plan, ms, passes });
        }
      })
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
        {status.kind === 'loading' && <p>Optimizing the sample job…</p>}
        {status.kind === 'error' && <p className={styles.error}>Engine failed: {status.message}</p>}
        {status.kind === 'ready' && <Result {...status} />}
      </section>
    </main>
  );
}

function Result({ version, plan, ms, passes }: Extract<Status, { kind: 'ready' }>) {
  const t = plan.totals;
  const used = t.sheetArea > 0 ? (t.usedArea / t.sheetArea) * 100 : 0;
  const unplaced = plan.unplaced.reduce((n, u) => n + u.count, 0);
  return (
    <>
      <p>
        Rust engine <strong>v{version}</strong> optimized the sample cabinet in{' '}
        {formatNumber(Math.round(ms))} ms ({passes} search passes).
      </p>
      <p className={styles.muted}>
        {t.sheets} {t.sheets === 1 ? 'sheet' : 'sheets'} · {formatNumber(Math.round(used))}% used ·{' '}
        {t.cuts} cuts · {formatMetres(t.cutLength)} of cutting
        {unplaced > 0 && ` · ${unplaced} parts didn't fit`}
      </p>
      {plan.sheets[0] && <SheetPreview sheet={plan.sheets[0]} />}
    </>
  );
}

/** Minimal drawing to check the geometry: parts, leftovers and cuts coloured by type. */
function SheetPreview({ sheet }: { sheet: SheetLayout }) {
  return (
    <svg
      className={styles.sheet}
      viewBox={`0 0 ${sheet.width} ${sheet.length}`}
      role="img"
      aria-label={`Layout of a ${sheet.length} × ${sheet.width} mm sheet`}
    >
      <rect width={sheet.width} height={sheet.length} className={styles.board} />
      {sheet.waste.map((r, i) => (
        <rect key={`w${i}`} x={r.x} y={r.y} width={r.w} height={r.h} className={styles.waste} />
      ))}
      {sheet.placements.map((p) => (
        <rect
          key={`${p.partId}-${p.instance}`}
          x={p.rect.x}
          y={p.rect.y}
          width={p.rect.w}
          height={p.rect.h}
          className={styles.part}
        />
      ))}
      {sheet.cuts.map((c) => (
        <line
          key={c.number}
          x1={c.x1}
          y1={c.y1}
          x2={c.x2}
          y2={c.y2}
          className={c.stage <= 1 ? styles.rip : styles.cross}
        />
      ))}
    </svg>
  );
}
