// Statistics across all projects: what was cut, what it cost, how much was wasted.
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { formatNumber, formatSquareMetres } from '../lib/format';
import type { CutRecord } from '../model/cutRecord';
import { formatMoney } from '../model/library';
import { computeStats, type Range } from '../model/stats';
import { useStore } from '../store/store';
import { MenuIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import { BackButton } from '../ui/BackButton';
import { BarList, ColumnChart, LineChart, TableView, type Point } from './Charts';
import { locale, t as i18nT } from '../i18n';
import { useTranslation } from 'react-i18next';
import styles from './Stats.module.css';

const RANGES: { id: Range; label: () => string }[] = [
  { id: '30d', label: () => i18nT('Last 30 days') },
  { id: '90d', label: () => i18nT('Last 90 days') },
  { id: '12m', label: () => i18nT('Last 12 months') },
  { id: 'all', label: () => i18nT('All time') },
];

const monthShort = () => new Intl.DateTimeFormat(locale(), { month: 'short' });
const monthLong = () => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' });
const dayFormat = () =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: '2-digit' });

export function StatsScreen({ onMenu }: { onMenu?: () => void }) {
  const { t, i18n } = useTranslation();
  const [records, setRecords] = useState<CutRecord[] | null>(null);
  const [range, setRange] = useState<Range>('12m');
  const offcuts = useStore((s) => s.offcuts);
  const materials = useStore((s) => s.materials);
  const currency = useStore((s) => s.settings.currency);

  useEffect(() => {
    let live = true;
    db.cutRecords
      .toArray()
      .then((r) => live && setRecords(r))
      .catch(() => live && setRecords([]));
    return () => {
      live = false;
    };
  }, []);

  const stats = useMemo(
    () => (records ? computeStats(records, offcuts, materials, range) : null),
    [records, offcuts, materials, range],
  );
  const money = (n: number) => formatMoney(n, currency);
  const moneyShort = (n: number) =>
    new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);

  const months: { cost: Point[]; waste: Point[] } = useMemo(() => {
    const ms = stats?.months ?? [];
    return {
      cost: ms.map((m) => ({
        label: monthShort().format(m.start),
        longLabel: monthLong().format(m.start),
        value: m.cost,
      })),
      waste: ms.map((m) => ({
        label: monthShort().format(m.start),
        longLabel: monthLong().format(m.start),
        value: m.wastePct,
      })),
    };
    // Month names follow the interface language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, i18n.language]);

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        {onMenu && (
          <button
            type="button"
            className={ui.iconButton}
            aria-label={t('Projects')}
            onClick={onMenu}
          >
            <MenuIcon size={22} />
          </button>
        )}
        <div className={styles.titleBlock}>
          <div className={ui.titleRow}>
            <h1 className={styles.title}>{t('Statistics')}</h1>
            <BackButton />
          </div>
          <span className={styles.meta}>{t('From sheets marked as cut in cut mode')}</span>
        </div>
      </div>

      <div className={ui.segmented} role="group" aria-label={t('Time range')}>
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={range === r.id}
            onClick={() => setRange(r.id)}
          >
            {r.label()}
          </button>
        ))}
      </div>

      {!stats ? (
        <p className={styles.meta}>{t('Loading…')}</p>
      ) : stats.sheets === 0 && stats.offcutsKept === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('Nothing cut in this period')}</p>
          <p>
            {t(
              'Statistics fill in as you finish sheets in cut mode (“Start cutting” in a project’s results).',
            )}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tiles}>
            <Tile
              label={t('Sheets cut')}
              value={formatNumber(stats.sheets)}
              note={formatSquareMetres(stats.sheetArea)}
            />
            <Tile
              label={t('Spent on board')}
              value={money(stats.cost)}
              note={stats.unpriced ? t('n_unpriced_sheets', { count: stats.unpriced }) : undefined}
            />
            <Tile
              label={t('Material used')}
              value={stats.usedPct === null ? '—' : `${formatNumber(Math.round(stats.usedPct))}%`}
              note={
                stats.wastePct === null
                  ? undefined
                  : t('{{pct}}% wasted', { pct: formatNumber(Math.round(stats.wastePct)) })
              }
            />
            <Tile
              label={t('Offcuts')}
              value={t('{{n}} kept', { n: formatNumber(stats.offcutsKept) })}
              note={t('{{n}} reused', { n: formatNumber(stats.offcutsReused) })}
            />
            <Tile
              label={t('Saved by reusing')}
              value={money(stats.saved)}
              note={t('at today’s board prices')}
            />
          </div>

          <div className={styles.grid}>
            <section className={styles.card} aria-labelledby="spend-h">
              <h2 id="spend-h">{t('Spent on board per month')}</h2>
              <ColumnChart
                points={months.cost}
                format={money}
                tickFormat={moneyShort}
                label={`${t('Spent on board per month')}, ${RANGES.find((r) => r.id === range)!
                  .label()
                  .toLowerCase()}`}
              />
              <TableView
                head={[t('Month'), t('Sheets'), t('Spent')]}
                rows={stats.months.map((m) => [
                  monthLong().format(m.start),
                  formatNumber(m.sheets),
                  money(m.cost),
                ])}
              />
            </section>

            <section className={styles.card} aria-labelledby="waste-h">
              <h2 id="waste-h">{t('Waste per month')}</h2>
              <p className={styles.cardNote}>
                {t('Board neither used for parts nor kept as offcuts')}
              </p>
              <LineChart
                points={months.waste}
                format={(v) => `${formatNumber(Math.round(v))}%`}
                max={Math.max(25, ...stats.months.map((m) => m.wastePct ?? 0))}
                label={t('Waste percentage per month')}
              />
              <TableView
                head={[t('Month'), t('Sheets'), t('Waste')]}
                rows={stats.months.map((m) => [
                  monthLong().format(m.start),
                  formatNumber(m.sheets),
                  m.wastePct === null ? '—' : `${formatNumber(Math.round(m.wastePct))}%`,
                ])}
              />
            </section>

            <section className={styles.card} aria-labelledby="mat-h">
              <h2 id="mat-h">{t('Most used materials')}</h2>
              <p className={styles.cardNote}>{t('Board area cut')}</p>
              <BarList
                items={stats.materials.slice(0, 8).map((m) => ({
                  name: m.name,
                  value: m.sheetArea,
                  note: t('n_sheets', { count: m.sheets }),
                }))}
                format={formatSquareMetres}
              />
            </section>

            <section className={styles.card} aria-labelledby="proj-h">
              <h2 id="proj-h">{t('Projects')}</h2>
              <table className={styles.projects}>
                <thead>
                  <tr>
                    <th>{t('Project')}</th>
                    <th className={styles.num}>{t('Sheets')}</th>
                    <th className={styles.num}>{t('Used')}</th>
                    <th className={styles.num}>{t('Board cost')}</th>
                    <th className={styles.num}>{t('Cut')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.projects.map((p) => (
                    <tr key={p.projectId}>
                      <td>{p.name}</td>
                      <td className={styles.num}>{formatNumber(p.sheets)}</td>
                      <td className={styles.num}>{formatNumber(Math.round(p.usedPct))}%</td>
                      <td className={styles.num}>
                        {money(p.cost)}
                        {p.unpriced > 0 && <span className={styles.partial}> +?</span>}
                      </td>
                      <td className={styles.num}>{dayFormat().format(p.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      {note && <span className={styles.tileNote}>{note}</span>}
    </div>
  );
}
