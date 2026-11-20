import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { BarLayout, LinearJob, LinearPlan } from '../engine/types';
import { formatNumber } from '../lib/format';
import { formatLength, formatLengthUnit, formatLong } from '../lib/units';
import { linearUnplacedReason, linearUsedPercent } from '../model/job';
import { linearKeepAdvice } from '../model/offcut';
import type { Project } from '../model/project';
import { useStore } from '../store/store';
import { useView } from '../store/view';
import { useMediaQuery } from '../ui/hooks';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  ExpandIcon,
  MinusIcon,
  PlusIcon,
  WarningIcon,
} from '../ui/icons';
import ui from '../ui/ui.module.css';
import { BarDrawing } from './BarDrawing';
import { useLinearPartInfo, type LinearPartInfo } from './partInfo';
import styles from './Results.module.css';

export function EmptyLinearResults({ running }: { running: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={styles.empty}>
      {running ? (
        <p>{t('Optimizing…')}</p>
      ) : (
        <>
          <p className={styles.emptyTitle}>{t('No linear cutting plan yet')}</p>
          <p>
            {t(
              'Enter at least one linear part with a length and quantity, and a stock bar length to cut it from.',
            )}
          </p>
        </>
      )}
    </div>
  );
}

export function LinearStatCards({
  plan,
  job,
  compact,
}: {
  plan: LinearPlan;
  job: LinearJob;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const totals = plan.totals;
  const used = linearUsedPercent(plan);
  const stockIds = new Set(plan.bars.map((b) => b.stockId));
  const first = job.stock.find((s) => s.id === plan.bars[0]?.stockId);
  const barNote =
    stockIds.size === 1 && first
      ? `${formatLengthUnit(first.length)}${first.label ? ` · ${first.label}` : ''}`
      : t('{{count}} bar lengths', { count: stockIds.size });

  return (
    <div className={compact ? styles.statsCompact : styles.stats}>
      <Stat
        label={t('Bars')}
        value={formatNumber(totals.bars)}
        note={compact ? undefined : barNote}
      />
      <Stat
        label={compact ? t('Used') : t('Material used')}
        value={`${formatNumber(Math.round(used))}%`}
      >
        {!compact && (
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${Math.min(100, used)}%` }} />
          </span>
        )}
      </Stat>
      <Stat
        label={t('Cuts')}
        value={formatNumber(totals.cuts)}
        note={
          compact
            ? undefined
            : t('{{length}} total stock', { length: formatLong(totals.stockLength) })
        }
      />
      {!compact && (
        <Stat
          label={t('Waste')}
          value={formatLong(totals.wasteLength)}
          note={
            totals.offcutsUsed > 0
              ? t('{{n}} reused', { n: formatNumber(totals.offcutsUsed) })
              : t('{{length}} used', { length: formatLong(totals.usedLength) })
          }
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {note && <span className={styles.statNote}>{note}</span>}
      {children}
    </div>
  );
}

export function LinearUnplacedBanner({
  plan,
  job,
  project,
}: {
  plan: LinearPlan;
  job: LinearJob;
  project: Project;
}) {
  const { t } = useTranslation();
  const info = useLinearPartInfo(project);
  if (plan.unplaced.length === 0) return null;
  const total = plan.unplaced.reduce((n, u) => n + u.count, 0);
  return (
    <div className={styles.unplaced} role="alert">
      <WarningIcon size={18} />
      <div>
        <p className={styles.unplacedTitle}>{t('n_parts_dont_fit', { count: total })}</p>
        <ul>
          {plan.unplaced.map((u) => {
            const spec = job.parts.find((p) => p.id === u.partId);
            const name = info.get(u.partId)?.label ?? u.partId;
            const reason = spec && linearUnplacedReason(spec, job);
            return (
              <li key={u.partId}>
                <strong>{name}</strong> ×{u.count}
                {spec && ` (${formatLengthUnit(spec.length)})`}:{' '}
                {reason === 'too-big'
                  ? t('longer than every stock bar (with end trim)')
                  : t('not enough stock bars')}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function barUsed(b: BarLayout): number {
  const len = b.placements.reduce((a, p) => a + p.length, 0);
  return b.length > 0 ? (len / b.length) * 100 : 0;
}

export function BarPager({ plan }: { plan: LinearPlan }) {
  const { t } = useTranslation();
  const index = useView((s) => Math.min(s.bar, plan.bars.length - 1));
  const setBar = useView((s) => s.setBar);
  const bar = plan.bars[index]!;
  const before = plan.bars.slice(0, index).reduce((n, b) => n + b.qty, 0);
  const total = plan.totals.bars;
  const range =
    bar.qty > 1
      ? t('Bars {{from}}–{{to}} of {{total}}', {
          from: before + 1,
          to: before + bar.qty,
          total,
        })
      : t('Bar {{n}} of {{total}}', { n: before + 1, total });
  return (
    <div className={styles.pager}>
      <button
        type="button"
        className={ui.iconButton}
        aria-label={t('Previous bar')}
        disabled={index === 0}
        onClick={() => setBar(index - 1)}
      >
        <ChevronLeftIcon size={16} />
      </button>
      <span className={styles.pagerLabel} aria-live="polite">
        {range}
      </span>
      <button
        type="button"
        className={ui.iconButton}
        aria-label={t('Next bar')}
        disabled={index >= plan.bars.length - 1}
        onClick={() => setBar(index + 1)}
      >
        <ChevronRightIcon size={16} />
      </button>
      {bar.qty > 1 && <span className={styles.qtyChip}>cut ×{bar.qty}</span>}
    </div>
  );
}

export function BarPanel({
  plan,
  project,
  withLegend,
  onExitFullscreen,
}: {
  plan: LinearPlan;
  project: Project;
  withLegend?: boolean;
  onExitFullscreen?: () => void;
}) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const view = useView();
  const parts = useLinearPartInfo(project);
  const job = useStore((s) => s.linearResult.job);
  const minOffcut = useStore((s) => s.settings.linearOffcutMinLength ?? 300);
  const index = Math.min(view.bar, plan.bars.length - 1);
  const bar = plan.bars[index]!;
  const stock = job?.stock.find((s) => s.id === bar.stockId);
  const used = barUsed(bar);
  const label = t('bar_drawing_label', {
    n: index + 1,
    count: bar.placements.length,
    length: bar.length,
    pct: Math.round(used),
  });

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <BarPager plan={plan} />
        <span className={styles.toolbarMeta}>
          {formatLengthUnit(bar.length)}
          {stock?.label ? ` · ${stock.label}` : ''} ·{' '}
          {t('n_parts', { count: bar.placements.length })} ·{' '}
          {t('{{pct}}% used', { pct: formatNumber(Math.round(used)) })}
        </span>
        <span className={styles.spacer} />
        <BarViewToggles />
        <div className={styles.zoom}>
          <button
            type="button"
            className={ui.iconButton}
            aria-label={t('Zoom out')}
            disabled={view.zoom <= 1}
            onClick={() => view.setZoom(view.zoom / 1.5)}
          >
            <MinusIcon size={16} />
          </button>
          <button
            type="button"
            className={styles.fit}
            onClick={() => view.setZoom(1)}
            aria-label={t('Fit bar')}
          >
            {view.zoom === 1 ? t('Fit') : `${Math.round(view.zoom * 100)}%`}
          </button>
          <button
            type="button"
            className={ui.iconButton}
            aria-label={t('Zoom in')}
            disabled={view.zoom >= 4}
            onClick={() => view.setZoom(view.zoom * 1.5)}
          >
            <PlusIcon size={16} />
          </button>
        </div>
        {onExitFullscreen ? (
          <button
            type="button"
            className={ui.iconButton}
            aria-label={t('Exit full screen')}
            title={t('Exit full screen')}
            onClick={onExitFullscreen}
          >
            <CollapseIcon size={16} />
          </button>
        ) : (
          <button
            type="button"
            className={ui.iconButton}
            aria-label={t('Full screen')}
            title={t('Full screen')}
            onClick={() => setFullscreen(true)}
          >
            <ExpandIcon size={16} />
          </button>
        )}
      </div>
      <div className={styles.paper}>
        <div className={styles.barCanvas} data-zoomed={view.zoom > 1 || undefined}>
          <div style={{ width: `${view.zoom * 100}%` }} className={styles.canvasInner}>
            <BarDrawing
              bar={bar}
              parts={parts}
              label={label}
              minOffcutLength={minOffcut}
            />
          </div>
        </div>
        {withLegend && <BarLegend bar={bar} parts={parts} />}
      </div>
      {fullscreen &&
        createPortal(
          <BarFullscreen plan={plan} project={project} onClose={() => setFullscreen(false)} />,
          document.body,
        )}
    </div>
  );
}

function BarFullscreen({
  plan,
  project,
  onClose,
}: {
  plan: LinearPlan;
  project: Project;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div
      ref={box}
      className={styles.fullscreen}
      role="dialog"
      aria-modal="true"
      aria-label={t('Bar in full screen')}
      tabIndex={-1}
    >
      <BarPanel plan={plan} project={project} withLegend onExitFullscreen={onClose} />
      <LinearCutOrder plan={plan} fullHeight />
    </div>
  );
}

function BarLegend({ bar, parts }: { bar: BarLayout; parts: Map<string, LinearPartInfo> }) {
  const { t } = useTranslation();
  const counts = new Map<string, number>();
  bar.placements.forEach((p) => counts.set(p.partId, (counts.get(p.partId) ?? 0) + 1));
  return (
    <div className={styles.legend}>
      <div className={styles.legendTitle}>{t('Legend')}</div>
      <div className={styles.legendRow}>
        <svg width="28" height="8" aria-hidden="true">
          <line x1="0" y1="4" x2="28" y2="4" stroke="#DD6B0B" strokeWidth="3" />
        </svg>
        {t('End trim')}
      </div>
      <div className={styles.legendRow}>
        <svg width="28" height="8" aria-hidden="true">
          <line
            x1="0"
            y1="4"
            x2="28"
            y2="4"
            stroke="#B42318"
            strokeWidth="2.5"
            strokeDasharray="6 4"
          />
        </svg>
        {t('Cross cut')}
      </div>
      <div className={styles.legendRow}>
        <svg width="28" height="14" aria-hidden="true">
          <rect width="28" height="14" fill="#E8DFD0" stroke="#C2B39C" />
        </svg>
        {t('Leftover')}
      </div>
      <div className={styles.legendRule} />
      <div className={styles.legendTitle}>{t('Parts on this bar')}</div>
      {[...counts].map(([id, n]) => {
        const info = parts.get(id);
        return (
          <div key={id} className={styles.legendRow}>
            <span className={styles.legendSwatch} style={{ background: info?.color }} />
            {info?.label ?? id} × {n}
          </div>
        );
      })}
    </div>
  );
}

function BarViewToggles() {
  const { t } = useTranslation();
  const view = useView();
  const phone = useMediaQuery('(max-width: 767px)');
  const items = [
    ['showLabels', t('Labels')],
    ['showSizes', t('Sizes')],
    ['showCuts', t('Cuts')],
  ] as const;
  if (phone) {
    return (
      <div className={styles.toggleChips} role="group" aria-label={t('Show on drawing')}>
        {items.map(([key, label]) => (
          <label key={key} className={styles.toggleChip} data-on={view[key] ? '' : undefined}>
            <input type="checkbox" checked={view[key]} onChange={() => view.toggle(key)} />
            <span className={styles.toggleBox} aria-hidden="true">
              {view[key] && <CheckIcon size={14} />}
            </span>
            {label}
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className={ui.segmented} role="group" aria-label={t('Show on drawing')}>
      {items.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={view[key]} onClick={() => view.toggle(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function LinearCutOrder({
  plan,
  title = true,
  fullHeight = false,
}: {
  plan: LinearPlan;
  title?: boolean;
  fullHeight?: boolean;
}) {
  const { t } = useTranslation();
  const index = useView((s) => Math.min(s.bar, plan.bars.length - 1));
  const activeCut = useView((s) => s.activeLinearCut);
  const setActiveCut = useView((s) => s.setActiveLinearCut);
  const bar = plan.bars[index]!;
  const phone = useMediaQuery('(max-width: 767px)');

  return (
    <div className={styles.listCard}>
      <div className={styles.listHeader}>
        {title && <h3>{t('Cut order')}</h3>}
        <span className={styles.spacer} />
        <span className={styles.listMeta}>
          {t('n_cuts', { count: bar.cuts.length })} · {t('stop-block length')}
        </span>
      </div>
      {bar.cuts.length === 0 ? (
        <p className={styles.listEmpty}>{t('This bar is used whole: no cuts needed.')}</p>
      ) : (
        <ol className={fullHeight ? `${styles.cutList} ${styles.cutListFull}` : styles.cutList}>
          {bar.cuts.map((c) => {
            const trim = c.stage === 0;
            const active = c.number === activeCut;
            const content = (
              <>
                <span className={trim ? styles.cutNumRip : styles.cutNumCross}>{c.number}</span>
                <span className={styles.cutPos}>{formatLength(c.fromLastEdge)}</span>
                <span className={styles.cutKind}>
                  {trim ? t('End trim') : t('Cross cut')}
                </span>
                <span className={styles.cutLen}>@ {formatLengthUnit(c.pos)}</span>
              </>
            );
            return (
              <li key={c.number}>
                {phone ? (
                  <div className={styles.cutRow}>{content}</div>
                ) : (
                  <button
                    type="button"
                    className={styles.cutRow}
                    aria-pressed={active}
                    onPointerEnter={() => setActiveCut(c.number)}
                    onPointerLeave={() => setActiveCut(null)}
                    onFocus={() => setActiveCut(c.number)}
                    onBlur={() => setActiveCut(null)}
                    onClick={() => setActiveCut(active ? null : c.number)}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function LinearOffcuts({ plan }: { plan: LinearPlan }) {
  const { t } = useTranslation();
  const minLen = useStore((s) => s.settings.linearOffcutMinLength ?? 300);
  const index = useView((s) => Math.min(s.bar, plan.bars.length - 1));
  const bar = plan.bars[index]!;
  const kind = linearKeepAdvice(bar.waste, minLen);

  return (
    <div className={`${styles.listCard} ${styles.offcutsCard}`}>
      <div className={styles.listHeader}>
        <h3>{t('Leftovers')}</h3>
        <span className={styles.spacer} />
        <span className={styles.listMeta}>{t('tail piece')}</span>
      </div>
      {bar.waste <= 0 ? (
        <p className={styles.listEmpty}>{t('No leftover on this bar.')}</p>
      ) : (
        <ul className={styles.offcutList}>
          <li>
            <span className={kind === 'suggested' ? styles.offcutBig : undefined}>
              {formatLengthUnit(bar.waste)}
            </span>
            <span className={kind === 'suggested' ? styles.offcutKeep : styles.offcutKind}>
              {kind === 'suggested' ? t('reusable') : t('scrap')}
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}
