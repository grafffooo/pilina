// Step-by-step 1D cut mode: one stop-block cut at a time, then keep the tail offcut of each finished bar.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BarLayout } from '../engine/types';
import { locale } from '../i18n';
import { formatLength, formatLengthUnit, unitLabel } from '../lib/units';
import { linearJobKey } from '../model/job';
import { linearStockPrice } from '../model/library';
import { linearKeepAdvice, offcutIdFromStock } from '../model/offcut';
import { BarDrawing } from '../results/BarDrawing';
import { useLinearPartInfo } from '../results/partInfo';
import { updateProject, updateSettings, useCurrentProject, useStore } from '../store/store';
import { promptDialog } from '../ui/dialogs';
import { CheckIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import { CutShell } from './CutMode';
import styles from './CutMode.module.css';
import {
  linearCutSentence,
  linearSteps,
  loadLinearSession,
  saveLinearSession,
  type LinearCutSession,
} from './session';

export function LinearCutMode() {
  const { t } = useTranslation();
  const project = useCurrentProject()!;
  const linearResult = useStore((s) => s.linearResult);
  const materials = useStore((s) => s.materials);
  const parts = useLinearPartInfo(project);

  const [session, setSession] = useState<LinearCutSession>(() => {
    const key = linearJobKey(linearResult.job);
    return (
      loadLinearSession(project.id, key) ?? {
        jobKey: key,
        job: linearResult.job!,
        plan: linearResult.plan!,
        bar: 0,
        cut: 0,
        kept: false,
        keptCodes: [],
        startedAt: Date.now(),
      }
    );
  });

  const update = (next: LinearCutSession | null) => {
    saveLinearSession(project.id, next);
    if (next) setSession(next);
  };
  const close = () => useStore.getState().setCutting(false);

  const all = useMemo(() => linearSteps(session.plan), [session.plan]);
  const finished = session.bar >= all.length;
  const step = all[Math.min(session.bar, all.length - 1)]!;
  const bar = step.layout;
  const cuts = bar.cuts;
  const settings = useStore((s) => s.settings);
  const minOffcut = settings.linearOffcutMinLength ?? 300;
  const barDone = session.cut >= cuts.length;
  const stock = session.job.stock.find((s) => s.id === bar.stockId);
  const material = materials.find((m) => m.id === stock?.material);
  const totalCuts = all.reduce((n, s) => n + s.layout.cuts.length, 0);
  const cutsBefore = all.slice(0, session.bar).reduce((n, s) => n + s.layout.cuts.length, 0);

  const next = () => {
    if (!barDone) update({ ...session, cut: session.cut + 1, kept: false });
  };
  const back = () => {
    if (session.cut > 0) update({ ...session, cut: session.cut - 1, kept: false });
    else if (session.bar > 0) {
      const prev = all[session.bar - 1]!;
      update({ ...session, bar: session.bar - 1, cut: prev.layout.cuts.length, kept: true });
    }
  };

  /** Records the finished bar, keeps the chosen tail offcut if any, and advances. */
  const finishBar = (keepLength: number | null, location: string, queueLabels: boolean) => {
    const store = useStore.getState();
    const kept =
      keepLength && keepLength > 0
        ? store.addOffcuts([
            {
              kind: 'linear',
              length: keepLength,
              width: 0,
              materialId: stock?.material ?? null,
              profileThickness: material?.thickness ?? null,
              profileWidth: material?.profileWidth ?? null,
              location,
              label: queueLabels ? 'queued' : 'none',
              sourceProjectId: project.id,
              sourceProjectName: project.name || t('Untitled project'),
            },
          ])
        : [];

    const usedOffcut = offcutIdFromStock(bar.stockId);
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

    const price = usedOffcut ? null : linearStockPrice(bar.stockId, bar.length, material);
    store.recordCut({
      id: crypto.randomUUID(),
      at: Date.now(),
      projectId: project.id,
      projectName: project.name || t('Untitled project'),
      kind: 'linear',
      materialId: stock?.material ?? null,
      materialName: material?.name ?? stock?.label ?? t('Unnamed material'),
      sheetLength: bar.length,
      sheetWidth: 0,
      usedArea: 0,
      keptArea: 0,
      usedLength: bar.placements.reduce((a, p) => a + p.length, 0),
      keptLength: keepLength ?? 0,
      fromOffcut: !!usedOffcut,
      offcutCode: usedCode,
      cost:
        price?.perPiece ??
        (price?.perMetre != null ? (price.perMetre * bar.length) / 1000 : null),
      currency: store.settings.currency,
    });

    const nextSession = {
      ...session,
      bar: session.bar + 1,
      cut: 0,
      kept: false,
      keptCodes: [...session.keptCodes, ...kept.map((o) => o.code)],
    };
    if (nextSession.bar >= all.length) updateProject({ cutAt: Date.now() });
    update(nextSession);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      if (e.key === 'Escape') close();
      else if (
        !finished &&
        !barDone &&
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
      <CutShell
        title={t('All bars are cut')}
        subtitle={project.name || t('Untitled project')}
        onClose={close}
        progress={1}
      >
        <div className={styles.finished}>
          <span className={styles.bigCheck}>
            <CheckIcon size={40} />
          </span>
          <p className={styles.finishedTitle}>
            {t('n_bars_cuts_done', { count: all.length, cuts: totalCuts })}
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
      </CutShell>
    );
  }

  const barTitle = t('Bar {{n}} of {{total}}', { n: session.bar + 1, total: all.length });
  const barSub = [stock?.label || material?.name, formatLengthUnit(bar.length)]
    .filter(Boolean)
    .join(' · ');

  if (barDone) {
    return (
      <CutShell
        title={t('{{bar}} is cut', { bar: barTitle })}
        subtitle={`${t('{{done}} of {{total}} cuts', { done: cuts.length, total: cuts.length })} · ${project.name || t('Untitled project')}`}
        onClose={close}
        progress={(cutsBefore + cuts.length) / Math.max(1, totalCuts)}
      >
        <KeepLinearOffcut
          key={session.bar}
          bar={bar}
          onBack={cuts.length > 0 ? back : undefined}
          onDone={finishBar}
        />
      </CutShell>
    );
  }

  const cut = cuts[session.cut]!;
  const following = cuts[session.cut + 1];
  const trim = cut.stage === 0;
  const placementIndex = session.cut - (cuts[0]?.stage === 0 ? 1 : 0);
  const placement = !trim && placementIndex >= 0 ? bar.placements[placementIndex] : undefined;
  const partLabel = placement ? parts.get(placement.partId)?.label : undefined;

  const speak = () => {
    const kind = trim ? t('End trim') : t('Cross cut');
    const text = `${t('Cut {{n}}', { n: cut.number })}. ${kind}. ${linearCutSentence(cut.fromLastEdge, cut.stage)}.`;
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale();
    window.speechSynthesis?.speak(utterance);
  };

  return (
    <CutShell
      title={t('Cut {{n}} of {{total}}', { n: session.cut + 1, total: cuts.length })}
      subtitle={`${barTitle} · ${barSub}`}
      onClose={close}
      progress={(cutsBefore + session.cut) / Math.max(1, totalCuts)}
      onSpeak={'speechSynthesis' in window ? speak : undefined}
    >
      <div className={styles.cutBody}>
        <div className={styles.cutCard}>
          <span className={trim ? styles.kindRip : styles.kindCross}>
            <span className={styles.kindNumber}>{cut.number}</span>
            {trim ? t('End trim') : t('Cross cut')}
          </span>
          <div className={styles.position}>
            <span className={styles.positionLabel}>
              {trim ? t('Trim off rough end') : t('Set stop block (from the last cut)')}
            </span>
            <span className={styles.positionValue}>
              {formatLength(cut.fromLastEdge)} <span className={styles.unit}>{unitLabel()}</span>
            </span>
          </div>
          <div className={styles.facts}>
            <div>
              <span>{t('From bar end')}</span>
              <strong>{formatLengthUnit(cut.pos)}</strong>
            </div>
            {partLabel && (
              <div>
                <span>{t('Part')}</span>
                <strong>{partLabel}</strong>
              </div>
            )}
            <div>
              <span>{t('Then')}</span>
              <strong>
                {following
                  ? t('{{kind}} at {{pos}}', {
                      kind: (following.stage === 0 ? t('End trim') : t('Cross cut')).toLowerCase(),
                      pos: formatLengthUnit(following.fromLastEdge),
                    })
                  : t('bar done')}
              </strong>
            </div>
          </div>
        </div>
        <div className={styles.drawing}>
          <BarDrawing
            bar={bar}
            parts={parts}
            cutStep={cut.number}
            minOffcutLength={minOffcut}
            label={t('{{bar}} with cut {{n}} highlighted at {{pos}}', {
              bar: barTitle,
              n: cut.number,
              pos: formatLengthUnit(cut.fromLastEdge),
            })}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.back}
          onClick={back}
          disabled={session.bar === 0 && session.cut === 0}
        >
          {t('Back')}
        </button>
        <button type="button" className={styles.primary} onClick={next}>
          {following ? t('Done, next cut') : t('Done, bar finished')}
        </button>
      </div>
    </CutShell>
  );
}

function KeepLinearOffcut({
  bar,
  onBack,
  onDone,
}: {
  bar: BarLayout;
  onBack?: () => void;
  onDone: (keepLength: number | null, location: string, queueLabels: boolean) => void;
}) {
  const { t } = useTranslation();
  const settings = useStore((s) => s.settings);
  const minLen = settings.linearOffcutMinLength ?? 300;
  const queued = useStore(
    (s) => s.offcuts.filter((o) => o.label === 'queued' && o.status !== 'used').length,
  );
  const advice = linearKeepAdvice(bar.waste, minLen);
  const [keepTail, setKeepTail] = useState(() => bar.waste > 0 && advice === 'suggested');
  const [location, setLocation] = useState(settings.locations[0] ?? '');
  const [labels, setLabels] = useState(true);
  const keeping = bar.waste > 0 && keepTail;
  const waiting = queued + (labels && keeping ? 1 : 0);

  return (
    <>
      <div className={styles.keepBody}>
        <div>
          <p className={styles.keepTitle}>{t('Keep any offcuts?')}</p>
          <p className={styles.keepHint}>
            {t('Suggested: bars at least {{size}}.', {
              size: formatLengthUnit(minLen),
            })}
          </p>
        </div>
        {bar.waste <= 0 ? (
          <p className={styles.keepHint}>{t('No leftover on this bar.')}</p>
        ) : (
          <div className={styles.keepPieces}>
            <MiniBar bar={bar} highlight={keeping} />
            <ul className={styles.keepList}>
              <li>
                <label className={styles.keepItem}>
                  <input
                    type="checkbox"
                    checked={keepTail}
                    onChange={(e) => setKeepTail(e.target.checked)}
                  />
                  <span>
                    <span className={styles.keepSize}>{formatLengthUnit(bar.waste)}</span>
                    <span className={advice === 'suggested' ? styles.tagGood : styles.tag}>
                      {advice === 'suggested' ? t('Suggested') : t('Too small')}
                    </span>
                  </span>
                </label>
              </li>
            </ul>
          </div>
        )}
        {keeping && (
          <>
            <div>
              <p className={styles.keepLabel}>{t('where_store', { count: 1 })}</p>
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
                <span className={styles.keepLabel}>{t('add_labels_to_queue', { count: 1 })}</span>
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
        <button type="button" className={ui.button} onClick={() => onDone(null, location, labels)}>
          {t('Skip')}
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={!keeping}
          onClick={() => onDone(keeping ? bar.waste : null, location, labels)}
        >
          {t('keep_n_offcuts', { count: keeping ? 1 : 0 })}
        </button>
      </div>
    </>
  );
}

function MiniBar({ bar, highlight }: { bar: BarLayout; highlight: boolean }) {
  const { t } = useTranslation();
  const W = 200;
  const H = 36;
  const scale = bar.length > 0 ? W / bar.length : 1;
  const tailX = bar.offcutStart * scale;
  const tailW = Math.max(0, bar.waste * scale);
  return (
    <svg
      className={styles.miniBar}
      viewBox={`-4 -4 ${W + 8} ${H + 8}`}
      role="img"
      aria-label={t('The bar with {{count}} offcuts selected', { count: highlight ? 1 : 0 })}
    >
      <rect x={0} y={0} width={W} height={H} fill="#EEE6D9" stroke="#3A2E22" strokeWidth={1.5} />
      {bar.placements.map((p, i) => (
        <rect
          key={i}
          x={p.x * scale}
          y={0}
          width={p.length * scale}
          height={H}
          fill="#DCCFBB"
          stroke="#A8987F"
          strokeWidth={1}
        />
      ))}
      {highlight && tailW > 0 && (
        <rect
          x={tailX}
          y={0}
          width={tailW}
          height={H}
          fill="#8A5A34"
          fillOpacity={0.35}
          stroke="#8A5A34"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
