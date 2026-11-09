import { useState } from 'react';
import { useCurrentProject, useStore } from '../store/store';
import { DownloadIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';

/** Builds and downloads the cutting-plan PDF. pdf-lib loads only on the first click. */
export function ExportPdfButton({ compact }: { compact?: boolean }) {
  const project = useCurrentProject();
  const plan = useStore((s) => s.result.plan);
  const job = useStore((s) => s.result.job);
  const status = useStore((s) => s.result.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !!project && !!plan && !!job && plan.sheets.length > 0 && status === 'ready';

  const onClick = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const { exportPdf } = await import('../pdf/exportPdf');
      const { cost, materials, settings } = useStore.getState();
      await exportPdf({ project, plan, job, cost, materials, currency: settings.currency });
    } catch (e) {
      console.error('PDF export failed', e);
      setError('Couldn’t create the PDF. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={compact ? ui.iconButton : ui.button}
        aria-label={compact ? 'Export PDF' : undefined}
        title={ready ? undefined : 'Available once the plan is up to date'}
        disabled={!ready || busy}
        onClick={() => void onClick()}
      >
        <DownloadIcon size={16} />
        {!compact && (busy ? 'Preparing PDF…' : 'Export PDF')}
      </button>
      {error && (
        <span role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>
          {error}
        </span>
      )}
    </>
  );
}
