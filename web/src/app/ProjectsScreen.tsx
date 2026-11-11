// The phone's Projects tab (a full screen instead of the sidebar) and the archive of cut projects.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../lib/format';
import { locale } from '../i18n';
import { formatMoney } from '../model/library';
import { useStore } from '../store/store';
import { useNow } from '../ui/hooks';
import {
  CheckIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImportIcon,
  LogoIcon,
  OffcutsIcon,
  PlusIcon,
  PriceIcon,
  SearchIcon,
  SettingsIcon,
  WarningIcon,
} from '../ui/icons';
import { useImportDialog } from './importHost';
import { ago, useProjectRows, when, type ProjectRowData } from './projectList';
import { cutDate } from './StatusBadge';
import { isDesktopApp } from '../lib/platform';
import { InstallButton } from './Pwa';
import styles from './ProjectsScreen.module.css';

/** Opens a project on its Parts section. */
function openProject(id: string) {
  const state = useStore.getState();
  state.setPhoneTab('parts');
  state.select(id);
}

function Search({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className={styles.search}>
      <SearchIcon size={20} />
      <input
        type="search"
        placeholder={label}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ProjectButton({ row, grouped }: { row: ProjectRowData; grouped?: boolean }) {
  const { t } = useTranslation();
  const currency = useStore((s) => s.settings.currency);
  const now = useNow();
  const p = row.project;
  const s = p.summary;
  return (
    <button
      type="button"
      className={styles.project}
      data-active={row.active ? '' : undefined}
      data-grouped={grouped ? '' : undefined}
      aria-current={row.active ? 'page' : undefined}
      onClick={() => openProject(p.id)}
    >
      <span className={styles.nameRow}>
        <span className={styles.projectName}>{p.name || t('Untitled project')}</span>
        {row.status.kind === 'cut' && (
          <span className={styles.cutBadge}>
            {t('Cut on {{date}}', { date: cutDate(row.status.at) })}
          </span>
        )}
      </span>
      <span className={styles.projectMeta}>
        {s && s.pieces > 0
          ? [
              t('n_parts', { count: s.pieces }),
              t('n_sheets', { count: s.sheets }),
              t('{{pct}}% used', { pct: formatNumber(Math.round(s.usedPct)) }),
              s.cost != null && s.cost > 0 ? formatMoney(s.cost, currency) : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : when(p.updatedAt, now)}
      </span>
    </button>
  );
}

type Sort = 'recent' | 'name';

/** "Today", "Yesterday", "This week" or "Earlier", by when the project was last changed. */
function recency(updatedAt: number, now: number): 0 | 1 | 2 | 3 {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (updatedAt >= start.getTime()) return 0;
  if (updatedAt >= start.getTime() - day) return 1;
  if (updatedAt >= start.getTime() - 6 * day) return 2;
  return 3;
}

export function ProjectsScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const { open, cut } = useProjectRows(query);
  const materialCount = useStore((s) => s.materials.length);
  const offcutCount = useStore((s) => s.offcuts.filter((o) => o.status === 'available').length);
  const saveState = useStore((s) => s.saveState);
  const savedAt = useStore((s) => s.savedAt);
  const now = useNow();
  const searching = query.trim() !== '';
  const total = open.length + cut.length;

  const groups = useMemo(() => {
    if (sort === 'name') {
      const byName = [...open].sort((a, b) =>
        a.project.name.localeCompare(b.project.name, locale()),
      );
      return [{ title: t('Active'), rows: byName }];
    }
    const titles = [t('Today'), t('Yesterday'), t('This week'), t('Earlier')];
    return titles
      .map((title, i) => ({
        title,
        rows: open.filter((r) => recency(r.project.updatedAt, now) === i),
      }))
      .filter((g) => g.rows.length > 0);
  }, [open, sort, now, t]);

  const lastCut = useMemo(() => {
    let best: ProjectRowData | null = null;
    for (const r of cut) {
      if (r.status.kind !== 'cut') continue;
      if (!best || (best.status.kind === 'cut' && r.status.at > best.status.at)) best = r;
    }
    return best;
  }, [cut]);

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <LogoIcon size={30} />
          </span>
          <h1>Pilina</h1>
          <button
            type="button"
            className={styles.gear}
            aria-label={t('Settings')}
            onClick={() => useStore.getState().setView('settings')}
          >
            <SettingsIcon size={22} />
          </button>
        </div>
        <Search value={query} onChange={setQuery} label={t('Search projects and parts')} />
      </header>

      <div className={styles.body}>
        <div className={styles.tiles}>
          <button
            type="button"
            className={styles.tile}
            aria-label={t('Offcut library')}
            onClick={() => useStore.getState().setView('offcuts')}
          >
            <OffcutsIcon size={22} />
            <span>
              {t('Offcuts')}
              <span className={styles.tileCount}>{offcutCount}</span>
            </span>
          </button>
          <button
            type="button"
            className={styles.tile}
            aria-label={t('Materials & prices')}
            onClick={() => useStore.getState().setView('library')}
          >
            <PriceIcon size={22} />
            <span>
              {t('Materials')}
              <span className={styles.tileCount}>{materialCount}</span>
            </span>
          </button>
          <button
            type="button"
            className={styles.tile}
            onClick={() => useStore.getState().setView('stats')}
          >
            <ChartIcon size={22} />
            <span>{t('Statistics')}</span>
          </button>
          <button
            type="button"
            className={styles.tile}
            aria-label={t('Import projects…')}
            onClick={() => useImportDialog.getState().show()}
          >
            <ImportIcon size={22} />
            <span>{t('Import')}</span>
          </button>
        </div>

        {cut.length > 0 && !searching && (
          <button
            type="button"
            className={styles.folder}
            onClick={() => useStore.getState().setView('archive')}
          >
            <span className={styles.folderIcon}>
              <CheckIcon size={22} />
            </span>
            <span className={styles.folderText}>
              <strong>{t('Cut projects')}</strong>
              {lastCut && lastCut.status.kind === 'cut' && (
                <span>
                  {t('Last cut: {{name}}, {{date}}', {
                    name: lastCut.project.name || t('Untitled project'),
                    date: cutDate(lastCut.status.at),
                  })}
                </span>
              )}
            </span>
            <span className={styles.folderCount}>{cut.length}</span>
            <ChevronRightIcon size={18} />
          </button>
        )}

        <div className={styles.sectionHead}>
          <h2>{t('Active')}</h2>
          <span className={styles.count}>{open.length}</span>
          <span className={styles.grow} />
          <button
            type="button"
            className={styles.sort}
            onClick={() => setSort(sort === 'recent' ? 'name' : 'recent')}
          >
            {t('Sort')} <strong>{sort === 'recent' ? t('Recent') : t('Name')}</strong>
          </button>
        </div>

        {groups.map((g) => (
          <section key={g.title} className={styles.group} aria-label={g.title}>
            <h3 className={styles.groupTitle}>
              <span>{g.title}</span>
              <span>{g.rows.length}</span>
            </h3>
            <div className={styles.card}>
              {g.rows.map((r) => (
                <ProjectButton key={r.project.id} row={r} grouped />
              ))}
            </div>
          </section>
        ))}

        {searching && cut.length > 0 && (
          <section className={styles.group} aria-label={t('Cut projects')}>
            <h3 className={styles.groupTitle}>
              <span>{t('Cut projects')}</span>
              <span>{cut.length}</span>
            </h3>
            <div className={styles.card}>
              {cut.map((r) => (
                <ProjectButton key={r.project.id} row={r} grouped />
              ))}
            </div>
          </section>
        )}

        {total === 0 && (
          <p className={styles.empty}>{t('No projects match “{{query}}”.', { query })}</p>
        )}

        <div className={styles.saveState} role="status">
          {saveState === 'error' ? (
            <>
              <WarningIcon size={16} />
              <span>{t('Couldn’t save. Storage may be full.')}</span>
            </>
          ) : saveState === 'pending' ? (
            <span>{t('Saving…')}</span>
          ) : (
            <>
              <CheckIcon size={16} />
              <span>
                {isDesktopApp()
                  ? t('Saved on this Mac · {{when}}', { when: ago(savedAt, now) })
                  : t('Saved in this browser · {{when}}', { when: ago(savedAt, now) })}
              </span>
            </>
          )}
        </div>
        {!isDesktopApp() && <InstallButton className={styles.install} />}
      </div>

      <button
        type="button"
        className={styles.fab}
        onClick={() => {
          useStore.getState().createProject();
          useStore.getState().setPhoneTab('parts');
        }}
      >
        <PlusIcon size={22} />
        {t('New project')}
      </button>
    </div>
  );
}

/** The month a project was cut, for the archive's groups. */
const monthKey = (at: number) => {
  const d = new Date(at);
  return d.getFullYear() * 12 + d.getMonth();
};

export function CutArchiveScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { cut } = useProjectRows(query);
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const months = useMemo(() => {
    const rows = cut
      .filter((r) => r.status.kind === 'cut')
      .sort((a, b) =>
        b.status.kind === 'cut' && a.status.kind === 'cut' ? b.status.at - a.status.at : 0,
      );
    const map = new Map<number, ProjectRowData[]>();
    for (const r of rows) {
      if (r.status.kind !== 'cut') continue;
      const k = monthKey(r.status.at);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [cut]);

  const monthFormat = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' });
  // The newest month starts open; searching opens every month that has a match.
  const isOpen = (k: number, i: number) =>
    query.trim() !== '' || (i === 0 ? !closed.has(k) : expanded.has(k));

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <button
            type="button"
            className={styles.gear}
            aria-label={t('Back')}
            onClick={() => history.back()}
          >
            <ChevronLeftIcon size={24} />
          </button>
          <h1>{t('Cut projects')}</h1>
          <span className={styles.folderCount}>{cut.length}</span>
        </div>
        <Search value={query} onChange={setQuery} label={t('Search projects and parts')} />
      </header>
      <div className={styles.body}>
        {months.map(([k, rows], i) => {
          const openMonth = isOpen(k, i);
          return (
            <section key={k} className={styles.card}>
              <button
                type="button"
                className={styles.monthHead}
                aria-expanded={openMonth}
                onClick={() => {
                  const flip = (set: Set<number>) => {
                    const next = new Set(set);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  };
                  if (i === 0) setClosed(flip(closed));
                  else setExpanded(flip(expanded));
                }}
              >
                <strong>
                  {monthFormat.format(
                    new Date(rows[0]!.status.kind === 'cut' ? rows[0]!.status.at : 0),
                  )}
                </strong>
                <span className={styles.count}>{rows.length}</span>
                <ChevronRightIcon size={18} />
              </button>
              {openMonth && rows.map((r) => <ProjectButton key={r.project.id} row={r} grouped />)}
            </section>
          );
        })}
        {months.length === 0 && (
          <p className={styles.empty}>{t('No projects match “{{query}}”.', { query })}</p>
        )}
      </div>
    </div>
  );
}
