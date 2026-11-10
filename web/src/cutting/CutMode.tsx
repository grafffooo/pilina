// Step-by-step cut mode: one cut at a time, then keep the offcuts of each finished sheet.
import { useEffect, useMemo, useState } from 'react';
import type { Rect, SheetLayout } from '../engine/types';
import { formatLength, formatLengthUnit, unitLabel } from '../lib/units';
import { cutKindLabel, isRipLike } from '../model/describe';
import { jobKey } from '../model/job';
import { stockPrice } from '../model/library';
import { keepAdvice, leftoverGrain, offcutIdFromStock } from '../model/offcut';
import { updateProject, updateSettings, useCurrentProject, useStore } from '../store/store';
import { usePartInfo } from '../results/partInfo';
import { SheetDrawing } from '../results/SheetDrawing';
import { CheckIcon, CloseIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import { cutSentence, loadSession, saveSession, steps, type CutSession } from './session';
import { locale, t as i18nT } from '../i18n';
import { promptDialog } from '../ui/dialogs';
import styles from './CutMode.module.css';
import { useTranslation } from 'react-i18next';

export function CutMode() {
  const { t } = useTranslation();
  const project = useCurrentProject()!;
  const result = useStore((s) => s.result);
  const materials = useStore((s) => s.materials);
  const parts = usePartInfo(project);

  // Resume a saved session for this exact job, or freeze the current plan.
  const [session, setSession] = useState<CutSession>(() => {
    const key = jobKey(result.job);
    return (
      loadSession(project.id, key) ?? {
        jobKey: key,
        job: result.job!,
        plan: result.plan!,
        sheet: 0,
        cut: 0,
        kept: false,
        keptCodes: [],
        startedAt: Date.now(),
      }
    );
  });
  const update = (next: CutSession | null) => {
    saveSession(project.id, next);
    if (next) setSession(next);
  };
  const close = () => useStore.getState().setCutting(false);

  const all = useMemo(() => steps(session.plan), [session.plan]);
  const finished = session.sheet >= all.length;
  const step = all[Math.min(session.sheet, all.length - 1)]!;
  const sheet = step.layout;
  const cuts = sheet.cuts;
  const sheetDone = session.cut >= cuts.length;
  const stock = session.job.stock.find((s) => s.id === sheet.stockId);
  const material = materials.find((m) => m.id === stock?.material);
  const totalCuts = all.reduce((n, s) => n + s.layout.cuts.length, 0);
  const cutsBefore = all.slice(0, session.sheet).reduce((n, s) => n + s.layout.cuts.length, 0);

  const next = () => {
    if (!sheetDone) update({ ...session, cut: session.cut + 1, kept: false });
  };
  const back = () => {
    if (session.cut > 0) update({ ...session, cut: session.cut - 1, kept: false });
    else if (session.sheet > 0) {
      const prev = all[session.sheet - 1]!;
      update({ ...session, sheet: session.sheet - 1, cut: prev.layout.cuts.length, kept: true });
    }
  };

  /** Records the finished sheet, keeps the chosen leftovers, and moves on. */
  const finishSheet = (keep: Rect[], location: string, queueLabels: boolean) => {
    const store = useStore.getState();
    const kept = keep.length
      ? store.addOffcuts(
          keep.map((r) => ({
            length: r.w,
            width: r.h,
            grain: leftoverGrain(r, stock?.grain ?? 'length'),
            materialId: stock?.material ?? null,
            location,
            label: queueLabels ? 'queued' : 'none',
            sourceProjectId: project.id,
            sourceProjectName: project.name || t('Untitled project'),
          })),
        )
      : [];
    // A library offcut that was just cut is used up.
    const usedOffcut = offcutIdFromStock(sheet.stockId);
    const usedCode = usedOffcut
      ? (store.offcuts.find((o) => o.id === usedOffcut)?.code ?? null)
      : null;
    if (usedOffcut) {
      store.updateOffcuts([usedOffcut], {
        status: 'used',
        usedAt: Date.now(),
        usedInProjectName: project.name || t('Untitled project'),
      });
    }
    const price = usedOffcut
      ? null
      : stockPrice(sheet.stockId, sheet.length, sheet.width, material);
    const area = sheet.length * sheet.width;
    store.recordCut({
      id: crypto.randomUUID(),
      at: Date.now(),
      projectId: project.id,
      projectName: project.name || t('Untitled project'),
      materialId: stock?.material ?? null,
      materialName: material?.name ?? stock?.label ?? t('Unnamed material'),
      sheetLength: sheet.length,
      sheetWidth: sheet.width,
      usedArea: sheet.placements.reduce((a, p) => a + p.rect.w * p.rect.h, 0),
      keptArea: keep.reduce((a, r) => a + r.w * r.h, 0),
      fromOffcut: !!usedOffcut,
      offcutCode: usedCode,
      cost: price?.perSheet ?? (price?.perSqm != null ? (price.perSqm * area) / 1e6 : null),
      currency: store.settings.currency,
    });
    const nextSession = {
      ...session,
      sheet: session.sheet + 1,
      cut: 0,
      kept: false,
      keptCodes: [...session.keptCodes, ...kept.map((o) => o.code)],
    };
    if (nextSession.sheet >= all.length) updateProject({ cutAt: Date.now() });
    update(nextSession);
  };

  // Keyboard: → / Enter / Space for the next cut, ← for back, Esc to leave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      if (e.key === 'Escape') close();
      else if (
        !finished &&
        !sheetDone &&
        (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')
      ) {
        e.preventDefault();
        next();
      } else if (!finished && e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (finished) {
    return (
      <Shell
        title={t('All sheets are cut')}
        subtitle={project.name || t('Untitled project')}
        onClose={close}
        progress={1}
      >
        <div className={styles.finished}>
          <span className={styles.bigCheck}>
            <CheckIcon size={40} />
          </span>
          <p className={styles.finishedTitle}>
            {t('n_sheets_cuts_done', { count: all.length, cuts: totalCuts })}
          </p>
          {session.keptCodes.length > 0 && (
            <p>
              {t('kept_offcuts', {
                count: session.keptCodes.length,
                codes: session.keptCodes.join(', '),
              })}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={ui.button}
            onClick={() => {
              update(null);
              close();
            }}
          >
            {t('Close')}
          </button>
          {session.keptCodes.length > 0 && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                update(null);
                close();
                useStore.getState().setView('labels');
              }}
            >
              {t('Print labels')}
            </button>
          )}
        </div>
      </Shell>
    );
  }

  const sheetTitle = t('Sheet {{n}} of {{total}}', { n: session.sheet + 1, total: all.length });
  const sheetSub = [
    stock?.label || material?.name,
    `${formatLength(sheet.length)} × ${formatLength(sheet.width)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  if (sheetDone) {
    return (
      <Shell
        title={t('{{sheet}} is cut', { sheet: sheetTitle })}
        subtitle={`${t('{{done}} of {{total}} cuts', { done: cuts.length, total: cuts.length })} · ${project.name || t('Untitled project')}`}
        onClose={close}
        progress={(cutsBefore + cuts.length) / Math.max(1, totalCuts)}
      >
        <KeepOffcuts
          sheet={sheet}
          onBack={cuts.length > 0 ? back : undefined}
          onDone={finishSheet}
        />
      </Shell>
    );
  }

  const cut = cuts[session.cut]!;
  const following = cuts[session.cut + 1];
  const rip = isRipLike(cut);
  const speak = () => {
    const text = `${t('Cut {{n}}', { n: cut.number })}. ${cutKindLabel(cut)}. ${cutSentence(cut.axis, cut.pos)}.`;
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale();
    window.speechSynthesis?.speak(utterance);
  };

  return (
    <Shell
      title={t('Cut {{n}} of {{total}}', { n: session.cut + 1, total: cuts.length })}
      subtitle={`${sheetTitle} · ${sheetSub}`}
      onClose={close}
      progress={(cutsBefore + session.cut) / Math.max(1, totalCuts)}
      onSpeak={'speechSynthesis' in window ? speak : undefined}
    >
      <div className={styles.cutBody}>
        <div className={styles.cutCard}>
          <span className={rip ? styles.kindRip : styles.kindCross}>
            <span className={styles.kindNumber}>{cut.number}</span>
            {cutKindLabel(cut)}
          </span>
          <div className={styles.position}>
            <span className={styles.positionLabel}>
              {cut.axis === 'x'
                ? t('Cut line from the left edge of the sheet')
                : t('Cut line from the top edge of the sheet')}
            </span>
            <span className={styles.positionValue}>
              {formatLength(cut.pos)} <span className={styles.unit}>{unitLabel()}</span>
            </span>
          </div>
          <div className={styles.facts}>
            <div>
              <span>{t('Cut length')}</span>
              <strong>{formatLengthUnit(cut.length)}</strong>
            </div>
            <div>
              <span>{t('Then')}</span>
              <strong>
                {following
                  ? t('{{kind}} at {{axis}} = {{pos}}', {
                      kind: cutKindLabel(following).toLowerCase(),
                      axis: following.axis,
                      pos: formatLength(following.pos),
                    })
                  : t('sheet done')}
              </strong>
            </div>
          </div>
        </div>
        <div className={styles.drawing}>
          <SheetDrawing
            sheet={sheet}
            parts={parts}
            cutStep={cut.number}
            label={t('{{sheet}} with cut {{n}} highlighted at {{axis}} = {{pos}}', {
              sheet: sheetTitle,
              n: cut.number,
              axis: cut.axis,
              pos: formatLengthUnit(cut.pos),
            })}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.back}
          onClick={back}
          disabled={session.sheet === 0 && session.cut === 0}
        >
          {t('Back')}
        </button>
        <button type="button" className={styles.primary} onClick={next}>
          {following ? t('Done, next cut') : t('Done, sheet finished')}
        </button>
      </div>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  progress,
  onClose,
  onSpeak,
  children,
}: {
  title: string;
  subtitle: string;
  progress: number;
  onClose: () => void;
  onSpeak?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('Cut mode')}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.headerButton}
          aria-label={t('Close cut mode')}
          onClick={onClose}
        >
          <CloseIcon size={22} />
        </button>
        <div className={styles.headerText}>
          <span className={styles.headerTitle} aria-live="polite">
            {title}
          </span>
          <span className={styles.headerSub}>{subtitle}</span>
        </div>
        {onSpeak && (
          <button
            type="button"
            className={styles.headerButton}
            aria-label={t('Read this cut aloud')}
            onClick={onSpeak}
          >
            <SpeakerIcon />
          </button>
        )}
      </header>
      <div className={styles.progress} aria-hidden="true">
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

const adviceText = (a: 'suggested' | 'strip' | 'small') =>
  a === 'suggested'
    ? i18nT('Suggested')
    : a === 'strip'
      ? i18nT('Narrow strip')
      : i18nT('Too small');

/** After a sheet: pick leftovers to keep, where they go, and whether to queue labels. */
function KeepOffcuts({
  sheet,
  onBack,
  onDone,
}: {
  sheet: SheetLayout;
  onBack?: () => void;
  onDone: (keep: Rect[], location: string, queueLabels: boolean) => void;
}) {
  const { t } = useTranslation();
  const settings = useStore((s) => s.settings);
  const queued = useStore(
    (s) => s.offcuts.filter((o) => o.label === 'queued' && o.status !== 'used').length,
  );
  const pieces = sheet.waste.map((r) => ({ r, advice: keepAdvice(r, settings) }));
  const listed = pieces.filter((p) => p.advice !== 'small');
  const hidden = pieces.length - listed.length;
  const [chosen, setChosen] = useState<Set<number>>(
    () => new Set(listed.flatMap((p, i) => (p.advice === 'suggested' ? [i] : []))),
  );
  const [location, setLocation] = useState(settings.locations[0] ?? '');
  const [labels, setLabels] = useState(true);
  const keep = listed.filter((_, i) => chosen.has(i)).map((p) => p.r);
  const waiting = queued + (labels ? keep.length : 0);

  return (
    <>
      <div className={styles.keepBody}>
        <div>
          <p className={styles.keepTitle}>{t('Keep any offcuts?')}</p>
          <p className={styles.keepHint}>
            {t('Suggested: pieces at least {{size}}.', {
              size: `${formatLength(settings.offcutMinLength)} × ${formatLengthUnit(settings.offcutMinWidth)}`,
            })}
          </p>
        </div>
        {listed.length === 0 ? (
          <p className={styles.keepHint}>{t('Nothing big enough to keep on this sheet.')}</p>
        ) : (
          <div className={styles.keepPieces}>
            <MiniSheet sheet={sheet} highlight={keep} />
            <ul className={styles.keepList}>
              {listed.map((p, i) => (
                <li key={i}>
                  <label className={styles.keepItem}>
                    <input
                      type="checkbox"
                      checked={chosen.has(i)}
                      onChange={() =>
                        setChosen((s) => {
                          const n = new Set(s);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          return n;
                        })
                      }
                    />
                    <span>
                      <span className={styles.keepSize}>
                        {formatLength(Math.max(p.r.w, p.r.h))} ×{' '}
                        {formatLength(Math.min(p.r.w, p.r.h))}
                      </span>
                      <span className={p.advice === 'suggested' ? styles.tagGood : styles.tag}>
                        {adviceText(p.advice)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hidden > 0 && (
          <p className={styles.keepHint}>{t('n_more_too_small', { count: hidden })}</p>
        )}
        {keep.length > 0 && (
          <>
            <div>
              <p className={styles.keepLabel}>{t('where_store', { count: keep.length })}</p>
              <div className={styles.places}>
                {settings.locations.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={l === location}
                    onClick={() => setLocation(l)}
                  >
                    {l}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={async () => {
                    const name = await promptDialog({
                      title: t('New storage place'),
                      label: t('New storage place, e.g. “Rack C, bottom”'),
                      confirmLabel: t('Add'),
                    });
                    if (!name) return;
                    if (!settings.locations.includes(name))
                      updateSettings({ locations: [...settings.locations, name] });
                    setLocation(name);
                  }}
                >
                  {t('+ New place')}
                </button>
              </div>
            </div>
            <label className={styles.switchRow}>
              <span>
                <span className={styles.keepLabel}>
                  {t('add_labels_to_queue', { count: keep.length })}
                </span>
                <span className={styles.keepHint}>{t('n_labels_waiting', { count: waiting })}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />
            </label>
          </>
        )}
      </div>
      <div className={styles.actions}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack}>
            {t('Back')}
          </button>
        )}
        <button type="button" className={ui.button} onClick={() => onDone([], location, labels)}>
          {t('Skip')}
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={keep.length === 0}
          onClick={() => onDone(keep, location, labels)}
        >
          {t('keep_n_offcuts', { count: keep.length })}
        </button>
      </div>
    </>
  );
}

function MiniSheet({ sheet, highlight }: { sheet: SheetLayout; highlight: Rect[] }) {
  const { t } = useTranslation();
  const m = Math.max(sheet.width, sheet.length);
  return (
    <svg
      className={styles.mini}
      viewBox={`${-m * 0.02} ${-m * 0.02} ${sheet.width + m * 0.04} ${sheet.length + m * 0.04}`}
      role="img"
      aria-label={t('The sheet with {{count}} offcuts selected', { count: highlight.length })}
    >
      <rect
        width={sheet.width}
        height={sheet.length}
        fill="#EEE6D9"
        stroke="#3A2E22"
        strokeWidth={m * 0.006}
      />
      {sheet.placements.map((p, i) => (
        <rect
          key={i}
          x={p.rect.x}
          y={p.rect.y}
          width={p.rect.w}
          height={p.rect.h}
          fill="#DCCFBB"
          stroke="#A8987F"
          strokeWidth={m * 0.003}
        />
      ))}
      {highlight.map((r, i) => (
        <rect
          key={`h${i}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="#8A5A34"
          fillOpacity={0.35}
          stroke="#8A5A34"
          strokeWidth={m * 0.008}
        />
      ))}
    </svg>
  );
}
