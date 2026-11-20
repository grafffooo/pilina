import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLength, formatLengthUnit } from '../lib/units';
import { oversizedPartsForTransport, resolveTransportProfile } from '../model/job';
import type { Project } from '../model/project';
import { useStore } from '../store/store';
import { DownloadIcon, WarningIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';

export function StoreSawPdfButton({ project }: { project: Project }) {
  const { t } = useTranslation();
  const plan = useStore((s) => s.result.plan);
  const linearPlan = useStore((s) => s.linearResult.plan);
  const settings = useStore((s) => s.settings);
  const profile = resolveTransportProfile(project, settings);
  const preCuts2d = plan?.preCuts ?? [];
  const preCuts1d = linearPlan?.preCuts ?? [];
  const [busy, setBusy] = useState(false);

  if (!profile || (preCuts2d.length === 0 && preCuts1d.length === 0)) return null;

  const onClick = async () => {
    setBusy(true);
    try {
      const { exportStoreSawPdf } = await import('../pdf/exportPdf');
      await exportStoreSawPdf({ project, profile, preCuts2d, preCuts1d });
    } catch (e) {
      console.error('Store saw PDF export failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={ui.button}
      disabled={busy}
      onClick={() => void onClick()}
    >
      <DownloadIcon size={16} />
      {busy ? t('Preparing PDF…') : t('Store Saw PDF')}
    </button>
  );
}

export function StoreSawCard({ project }: { project: Project }) {
  const { t } = useTranslation();
  const plan = useStore((s) => s.result.plan);
  const linearPlan = useStore((s) => s.linearResult.plan);
  const settings = useStore((s) => s.settings);
  const profile = resolveTransportProfile(project, settings);

  if (!profile) return null;

  const oversized = oversizedPartsForTransport(project, profile);
  const hasOversized = oversized.sheetParts.length > 0 || oversized.linearParts.length > 0;
  const preCuts2d = plan?.preCuts ?? [];
  const preCuts1d = linearPlan?.preCuts ?? [];

  if (!hasOversized && preCuts2d.length === 0 && preCuts1d.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hasOversized && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--warn-bg)',
            color: 'var(--warn-text)',
            fontSize: 13,
          }}
        >
          <WarningIcon size={18} />
          <div>
            <strong>{t('Some parts exceed vehicle capacity')}</strong>
            <div style={{ marginTop: 2 }}>
              {t('{{n}} part(s) are larger than {{name}} ({{maxL}} × {{maxW}}).', {
                n: oversized.sheetParts.length + oversized.linearParts.length,
                name: profile.name,
                maxL: formatLength(profile.maxLength),
                maxW: formatLengthUnit(profile.maxWidth),
              })}
            </div>
          </div>
        </div>
      )}

      {(preCuts2d.length > 0 || preCuts1d.length > 0) && (
        <section
          aria-label={t('Store saw pre-cuts')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{t('Store saw pre-cuts')}</strong>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {profile.name} · {formatLength(profile.maxLength)} × {formatLengthUnit(profile.maxWidth)}
            </span>
            <span style={{ flex: 1 }} />
            <StoreSawPdfButton project={project} />
          </div>

          {preCuts2d.map((s) => (
            <div
              key={s.sourceStockId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
                fontSize: 13,
              }}
            >
              <div>
                <strong>{s.label || t('Material')}</strong>{' '}
                <span style={{ color: 'var(--text-2)' }}>
                  ({formatLength(s.length)} × {formatLengthUnit(s.width)})
                </span>
              </div>
              <div style={{ color: 'var(--text-2)' }}>
                {s.cuts
                  .map(
                    (c, i) =>
                      `${i + 1}. ${c.axis === 'y' ? t('Cross cut') : t('Rip')} @ ${formatLengthUnit(c.pos)}`,
                  )
                  .join(' · ')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                → {s.pieces.length} × {formatLength(s.pieces[0]?.length ?? 0)} ×{' '}
                {formatLengthUnit(s.pieces[0]?.width ?? 0)}
              </div>
            </div>
          ))}

          {preCuts1d.map((b) => (
            <div
              key={b.sourceStockId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                paddingTop: 8,
                borderTop: '1px solid var(--border)',
                fontSize: 13,
              }}
            >
              <div>
                <strong>{b.label || t('Linear stock')}</strong>{' '}
                <span style={{ color: 'var(--text-2)' }}>({formatLengthUnit(b.length)})</span>
              </div>
              <div style={{ color: 'var(--text-2)' }}>
                {t('Cross cut')}: {b.cutPositions.map((p) => formatLengthUnit(p)).join(', ')} →{' '}
                {b.pieceLengths.map((p) => formatLengthUnit(p)).join(' + ')}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
