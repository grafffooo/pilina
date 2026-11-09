import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Job, Plan, SheetLayout } from '../engine/types';
import { formatMetres, formatMm, formatNumber } from '../lib/format';
import { classifyOffcut, cutKindLabel, isRipLike, sizeOf } from '../model/describe';
import { unplacedReason, usedPercent } from '../model/job';
import type { Project } from '../model/project';
import { useStore } from '../store/store';
import { useView } from '../store/view';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  ExpandIcon,
  MinusIcon,
  PlusIcon,
  WarningIcon,
} from '../ui/icons';
import ui from '../ui/ui.module.css';
import { CostCard } from './CostCard';
import { t as i18nT } from '../i18n';
import { ExportPdfButton } from './ExportPdfButton';
import { StartCuttingButton } from '../cutting/StartCuttingButton';
import { usePartInfo, type PartInfo } from './partInfo';
import { SheetDrawing } from './SheetDrawing';
import styles from './Results.module.css';
import { useTranslation } from 'react-i18next';

/** Desktop results column. */
export function Results({ project }: { project: Project }) {
  const { t } = useTranslation();
  const { plan, job, status } = useStore((s) => s.result);
  return (
    <section className={styles.results} aria-labelledby="results-h">
      <div className={styles.resultsHeader}>
        <h2 id="results-h">{t('Results')}</h2>
        <span className={styles.spacer} />
        <ExportPdfButton />
        <StartCuttingButton />
      </div>
      {!plan || !job ? (
        <EmptyResults running={status === 'running'} />
      ) : (
        <>
          <StatCards plan={plan} job={job} />
          <UnplacedBanner plan={plan} job={job} project={project} />
          <CostCard project={project} />
          {plan.sheets.length > 0 && (
            <>
              <SheetPanel plan={plan} project={project} withLegend />
              <div className={styles.lists}>
                <CutOrder plan={plan} />
                <Offcuts plan={plan} />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function EmptyResults({ running }: { running: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={styles.empty}>
      {running ? (
        <p>{t('Optimizing…')}</p>
      ) : (
        <>
          <p className={styles.emptyTitle}>{t('No cutting plan yet')}</p>
          <p>
            {t(
              'Enter at least one part with a length, width and quantity, and a stock sheet to cut it from.',
            )}
          </p>
        </>
      )}
    </div>
  );
}

export function StatCards({ plan, job, compact }: { plan: Plan; job: Job; compact?: boolean }) {
  const { t } = useTranslation();
  const totals = plan.totals;
  const used = usedPercent(plan);
  const stockIds = new Set(plan.sheets.map((s) => s.stockId));
  const first = job.stock.find((s) => s.id === plan.sheets[0]?.stockId);
  const sheetNote =
    stockIds.size === 1 && first
      ? `${formatMm(first.length)} × ${formatMm(first.width)}${first.label ? ` · ${first.label}` : ''}`
      : t('{{count}} sheet sizes', { count: stockIds.size });
  const banded = job.parts.filter((p) => p.edges && Object.values(p.edges).some(Boolean));
  const bandedPieces = banded.reduce((n, p) => n + p.qty, 0);

  return (
    <div className={compact ? styles.statsCompact : styles.stats}>
      <Stat
        label={t('Sheets')}
        value={formatNumber(totals.sheets)}
        note={compact ? undefined : sheetNote}
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
            : t('{{length}} of sawing', { length: formatMetres(totals.cutLength) })
        }
      />
      {!compact && (
        <Stat
          label={t('Edge banding')}
          value={formatMetres(totals.edgeBandLength)}
          note={bandedPieces > 0 ? t('n_parts_banded', { count: bandedPieces }) : t('none set')}
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

export function UnplacedBanner({ plan, job, project }: { plan: Plan; job: Job; project: Project }) {
  const { t } = useTranslation();
  const info = usePartInfo(project);
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
            const reason = spec && unplacedReason(spec, job);
            return (
              <li key={u.partId}>
                <strong>{name}</strong> ×{u.count}
                {spec && ` (${formatMm(spec.length)} × ${formatMm(spec.width)})`}:{' '}
                {reason === 'too-big'
                  ? t('bigger than every stock sheet (with grain and edge trim)')
                  : t('not enough stock sheets')}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function sheetUsed(s: SheetLayout): number {
  const area = s.placements.reduce((a, p) => a + p.rect.w * p.rect.h, 0);
  return (area / (s.width * s.length)) * 100;
}

export function SheetPager({ plan }: { plan: Plan }) {
  const { t } = useTranslation();
  const index = useView((s) => Math.min(s.sheet, plan.sheets.length - 1));
  const setSheet = useView((s) => s.setSheet);
  const sheet = plan.sheets[index]!;
  // Copies before this layout, for "Sheets 2–3 of 5" when identical sheets are merged.
  const before = plan.sheets.slice(0, index).reduce((n, s) => n + s.qty, 0);
  const total = plan.totals.sheets;
  const range =
    sheet.qty > 1
      ? t('Sheets {{from}}–{{to}} of {{total}}', {
          from: before + 1,
          to: before + sheet.qty,
          total,
        })
      : t('Sheet {{n}} of {{total}}', { n: before + 1, total });
  return (
    <div className={styles.pager}>
      <button
        type="button"
        className={ui.iconButton}
        aria-label={t('Previous sheet')}
        disabled={index === 0}
        onClick={() => setSheet(index - 1)}
      >
        <ChevronLeftIcon size={16} />
      </button>
      <span className={styles.pagerLabel} aria-live="polite">
        {range}
      </span>
      <button
        type="button"
        className={ui.iconButton}
        aria-label={t('Next sheet')}
        disabled={index >= plan.sheets.length - 1}
        onClick={() => setSheet(index + 1)}
      >
        <ChevronRightIcon size={16} />
      </button>
      {sheet.qty > 1 && <span className={styles.qtyChip}>cut ×{sheet.qty}</span>}
    </div>
  );
}

export function SheetPanel({
  plan,
  project,
  withLegend,
  onExitFullscreen,
}: {
  plan: Plan;
  project: Project;
  withLegend?: boolean;
  /** Set when this panel is the one shown in full screen. */
  onExitFullscreen?: () => void;
}) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const view = useView();
  const parts = usePartInfo(project);
  const job = useStore((s) => s.result.job);
  const index = Math.min(view.sheet, plan.sheets.length - 1);
  const sheet = plan.sheets[index]!;
  const stock = job?.stock.find((s) => s.id === sheet.stockId);
  const used = sheetUsed(sheet);
  const label = t('sheet_drawing_label', {
    n: index + 1,
    count: sheet.placements.length,
    length: sheet.length,
    width: sheet.width,
    pct: Math.round(used),
  });

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <SheetPager plan={plan} />
        <span className={styles.toolbarMeta}>
          {formatMm(sheet.length)} × {formatMm(sheet.width)}
          {stock?.label ? ` · ${stock.label}` : ''} ·{' '}
          {t('n_parts', { count: sheet.placements.length })} ·{' '}
          {t('{{pct}}% used', { pct: formatNumber(Math.round(used)) })}
        </span>
        <span className={styles.spacer} />
        <div className={ui.segmented} role="group" aria-label={t('Show on drawing')}>
          <button
            type="button"
            aria-pressed={view.showCuts}
            onClick={() => view.toggle('showCuts')}
          >
            {t('Cuts')}
          </button>
          <button
            type="button"
            aria-pressed={view.showSizes}
            onClick={() => view.toggle('showSizes')}
          >
            {t('Sizes')}
          </button>
          <button
            type="button"
            aria-pressed={view.showEdges}
            onClick={() => view.toggle('showEdges')}
          >
            {t('Edges')}
          </button>
        </div>
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
            aria-label={t('Fit sheet')}
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
        <div className={styles.canvas} data-zoomed={view.zoom > 1 || undefined}>
          <div style={{ width: `${view.zoom * 100}%` }} className={styles.canvasInner}>
            <SheetDrawing sheet={sheet} parts={parts} label={label} />
          </div>
        </div>
        {withLegend && <Legend sheet={sheet} parts={parts} />}
      </div>
      {fullscreen &&
        createPortal(
          <SheetFullscreen plan={plan} project={project} onClose={() => setFullscreen(false)} />,
          document.body,
        )}
    </div>
  );
}

/** The sheet drawing over the whole app window, with the cut order beside it. */
function SheetFullscreen({
  plan,
  project,
  onClose,
}: {
  plan: Plan;
  project: Project;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  // The latest onClose, so the effect below runs only on open and close.
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
      aria-label={t('Sheet in full screen')}
      tabIndex={-1}
    >
      <SheetPanel plan={plan} project={project} withLegend onExitFullscreen={onClose} />
      <CutOrder plan={plan} fullHeight />
    </div>
  );
}

function Legend({ sheet, parts }: { sheet: SheetLayout; parts: Map<string, PartInfo> }) {
  const { t } = useTranslation();
  const grain = useStore(
    (s) => s.result.job?.stock.find((x) => x.id === sheet.stockId)?.grain ?? 'length',
  );
  const counts = new Map<string, number>();
  sheet.placements.forEach((p) => counts.set(p.partId, (counts.get(p.partId) ?? 0) + 1));
  return (
    <div className={styles.legend}>
      <div className={styles.legendTitle}>{t('Legend')}</div>
      <div className={styles.legendRow}>
        <svg width="28" height="8" aria-hidden="true">
          <line x1="0" y1="4" x2="28" y2="4" stroke="#DD6B0B" strokeWidth="3" />
        </svg>
        {t('Rip cut (full length)')}
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
      {grain !== 'none' && (
        <div className={styles.legendRow}>
          {/* The drawing has the sheet's length running down the page. */}
          <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
            {grain === 'length' ? (
              <path d="M14 1v12M10.5 4.5 14 1l3.5 3.5M10.5 9.5 14 13l3.5-3.5" />
            ) : (
              <path d="M3 7h22M6.5 3.5 3 7l3.5 3.5M21.5 3.5 25 7l-3.5 3.5" />
            )}
          </svg>
          {grain === 'length' ? t('Grain along the length') : t('Grain along the width')}
        </div>
      )}
      <div className={styles.legendRule} />
      <div className={styles.legendTitle}>{t('Parts on this sheet')}</div>
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

/** `fullHeight` lets the list grow with the page (phone Cut tab) instead of scrolling inside. */
export function CutOrder({
  plan,
  title = true,
  fullHeight = false,
}: {
  plan: Plan;
  title?: boolean;
  fullHeight?: boolean;
}) {
  const { t } = useTranslation();
  const index = useView((s) => Math.min(s.sheet, plan.sheets.length - 1));
  const activeCut = useView((s) => s.activeCut);
  const setActiveCut = useView((s) => s.setActiveCut);
  const sheet = plan.sheets[index]!;
  const length = sheet.cuts.reduce((a, c) => a + c.length, 0);
  return (
    <div className={styles.listCard}>
      <div className={styles.listHeader}>
        {title && <h3>{t('Cut order')}</h3>}
        <span className={styles.spacer} />
        <span className={styles.listMeta}>
          {t('n_cuts', { count: sheet.cuts.length })} · {formatMetres(length)}
        </span>
      </div>
      {sheet.cuts.length === 0 ? (
        <p className={styles.listEmpty}>{t('This sheet is used whole: no cuts needed.')}</p>
      ) : (
        <ol className={fullHeight ? `${styles.cutList} ${styles.cutListFull}` : styles.cutList}>
          {sheet.cuts.map((c) => {
            const rip = isRipLike(c);
            const active = c.number === activeCut;
            return (
              <li key={c.number}>
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
                  <span className={rip ? styles.cutNumRip : styles.cutNumCross}>{c.number}</span>
                  <span className={styles.cutPos}>
                    {c.axis} = {formatMm(c.pos)}
                  </span>
                  <span className={styles.cutKind}>{cutKindLabel(c)}</span>
                  <span className={styles.cutLen}>{formatMm(c.length)} mm</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const offcutText = (k: 'usable' | 'strip' | 'scrap') =>
  k === 'usable' ? i18nT('reusable') : k === 'strip' ? i18nT('strip') : i18nT('scrap');
const MAX_OFFCUTS = 8;

export function Offcuts({ plan }: { plan: Plan }) {
  const { t } = useTranslation();
  const index = useView((s) => Math.min(s.sheet, plan.sheets.length - 1));
  const sheet = plan.sheets[index]!;
  const shown = sheet.waste.slice(0, MAX_OFFCUTS);
  const more = sheet.waste.length - shown.length;
  return (
    <div className={`${styles.listCard} ${styles.offcutsCard}`}>
      <div className={styles.listHeader}>
        <h3>{t('Leftovers')}</h3>
        <span className={styles.spacer} />
        <span className={styles.listMeta}>{t('largest first')}</span>
      </div>
      {shown.length === 0 ? (
        <p className={styles.listEmpty}>{t('No leftovers on this sheet.')}</p>
      ) : (
        <ul className={styles.offcutList}>
          {shown.map((r, i) => {
            const s = sizeOf(r);
            const kind = classifyOffcut(r);
            return (
              <li key={i}>
                <span className={kind === 'usable' ? styles.offcutBig : undefined}>
                  {formatMm(s.long)} × {formatMm(s.short)}
                </span>
                <span className={kind === 'usable' ? styles.offcutKeep : styles.offcutKind}>
                  {offcutText(kind)}
                </span>
              </li>
            );
          })}
          {more > 0 && (
            <li className={styles.offcutMore}>{t('and {{count}} smaller', { count: more })}</li>
          )}
        </ul>
      )}
    </div>
  );
}
