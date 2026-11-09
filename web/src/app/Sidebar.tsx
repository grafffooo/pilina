import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatNumber } from '../lib/format';
import { formatMoney } from '../model/library';
import { useNow } from '../ui/hooks';
import {
  ChartIcon,
  CheckIcon,
  ImportIcon,
  LogoIcon,
  OffcutsIcon,
  PlusIcon,
  PriceIcon,
  SearchIcon,
  SettingsIcon,
  WarningIcon,
} from '../ui/icons';
import ui from '../ui/ui.module.css';
import { useStore } from '../store/store';
import { ImportDialog } from './ImportDialog';
import { isDesktopApp } from '../lib/platform';
import { InstallButton } from './Pwa';
import { locale, t as i18nT } from '../i18n';
import { SettingsDialog } from './SettingsDialog';
import styles from './Sidebar.module.css';
import { useTranslation } from 'react-i18next';

const dayFormat = () =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = () => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });

function when(ts: number, now: number): string {
  const d = new Date(ts);
  const today = new Date(now);
  const time = timeFormat().format(d);
  if (d.toDateString() === today.toDateString()) return i18nT('Today, {{time}}', { time });
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return i18nT('Yesterday, {{time}}', { time });
  return dayFormat().format(d);
}

function ago(ts: number | null, now: number): string {
  if (ts === null) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return i18nT('just now');
  const m = Math.round(s / 60);
  return m < 60 ? i18nT('{{count}} min ago', { count: m }) : timeFormat().format(new Date(ts));
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const projects = useStore((s) => s.projects);
  const currentId = useStore((s) => s.currentId);
  const saveState = useStore((s) => s.saveState);
  const savedAt = useStore((s) => s.savedAt);
  const view = useStore((s) => s.view);
  const materialCount = useStore((s) => s.materials.length);
  const offcutCount = useStore((s) => s.offcuts.filter((o) => o.status === 'available').length);
  const currency = useStore((s) => s.settings.currency);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const now = useNow();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.parts.some((r) => r.label.toLowerCase().includes(q)),
    );
  }, [projects, query]);

  return (
    <aside className={styles.sidebar} aria-label={t('Projects')}>
      <div className={styles.brand}>
        <LogoIcon />
        <span className={styles.brandName}>Pilina</span>
        <span className={styles.spacer} />
        <SettingsButton />
      </div>

      <label className={styles.search}>
        <SearchIcon size={16} />
        <input
          type="search"
          placeholder={t('Search projects and parts')}
          aria-label={t('Search projects and parts')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <button
        type="button"
        className={styles.newProject}
        onClick={() => {
          setQuery('');
          useStore.getState().createProject();
          onNavigate?.();
        }}
      >
        <PlusIcon size={16} />
        {t('New project')}
      </button>

      <div className={styles.sectionTitle}>
        <span>{t('Projects')}</span>
        <span>{projects.length}</span>
      </div>

      <nav className={styles.list}>
        {shown.map((p) => {
          const active = p.id === currentId;
          const s = p.summary;
          return (
            <button
              key={p.id}
              type="button"
              className={styles.project}
              aria-current={active && view === 'project' ? 'page' : undefined}
              onClick={() => {
                useStore.getState().select(p.id);
                onNavigate?.();
              }}
            >
              <span className={styles.projectName}>{p.name || t('Untitled project')}</span>
              {s && s.pieces > 0 && (
                <span className={styles.projectMeta}>
                  {t('n_parts', { count: s.pieces })} · {t('n_sheets', { count: s.sheets })} ·{' '}
                  {t('{{pct}}% used', { pct: formatNumber(Math.round(s.usedPct)) })}
                  {s.cost != null && s.cost > 0 && ` · ${formatMoney(s.cost, currency)}`}
                </span>
              )}
              <span className={styles.projectDate}>{when(p.updatedAt, now)}</span>
            </button>
          );
        })}
        {shown.length === 0 && (
          <p className={styles.empty}>{t('No projects match “{{query}}”.', { query })}</p>
        )}
      </nav>

      <div className={styles.spacerV} />

      <div className={styles.footerNav}>
        <button
          type="button"
          className={styles.libraryLink}
          aria-current={view === 'offcuts' || view === 'labels' ? 'page' : undefined}
          onClick={() => {
            useStore.getState().setView('offcuts');
            onNavigate?.();
          }}
        >
          <OffcutsIcon />
          <span>{t('Offcut library')}</span>
          <span className={styles.count}>{offcutCount}</span>
        </button>

        <button
          type="button"
          className={styles.libraryLink}
          aria-current={view === 'library' ? 'page' : undefined}
          onClick={() => {
            useStore.getState().setView('library');
            onNavigate?.();
          }}
        >
          <PriceIcon />
          <span>{t('Materials & prices')}</span>
          <span className={styles.count}>{materialCount}</span>
        </button>

        <button
          type="button"
          className={styles.libraryLink}
          aria-current={view === 'stats' ? 'page' : undefined}
          onClick={() => {
            useStore.getState().setView('stats');
            onNavigate?.();
          }}
        >
          <ChartIcon />
          <span>{t('Statistics')}</span>
        </button>

        <button type="button" className={styles.libraryLink} onClick={() => setImporting(true)}>
          <ImportIcon />
          <span>{t('Import projects…')}</span>
        </button>
        {!isDesktopApp() && <InstallButton className={styles.libraryLink} />}
      </div>
      {importing &&
        createPortal(<ImportDialog onClose={() => setImporting(false)} />, document.body)}

      <div className={styles.saveState} role="status">
        {saveState === 'error' ? (
          <>
            <WarningIcon size={14} />
            <span>{t('Couldn’t save. Storage may be full.')}</span>
          </>
        ) : saveState === 'pending' ? (
          <span>{t('Saving…')}</span>
        ) : (
          <>
            <CheckIcon size={14} />
            <span>
              {isDesktopApp()
                ? t('Saved on this Mac · {{when}}', { when: ago(savedAt, now) })
                : t('Saved in this browser · {{when}}', { when: ago(savedAt, now) })}
            </span>
          </>
        )}
      </div>
    </aside>
  );
}

function SettingsButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={ui.iconButton}
        aria-label={t('Settings')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SettingsIcon />
      </button>
      {open && createPortal(<SettingsDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
