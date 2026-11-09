import { useMemo, useState } from 'react';
import { formatNumber } from '../lib/format';
import { useNow } from '../ui/hooks';
import { CheckIcon, LogoIcon, PlusIcon, SearchIcon, SettingsIcon, WarningIcon } from '../ui/icons';
import { Popover } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import { useStore } from '../store/store';
import { loadAppearance, saveAppearance, type Accent, type Theme } from './appearance';
import styles from './Sidebar.module.css';

const dayFormat = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

function when(ts: number, now: number): string {
  const d = new Date(ts);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return `Today, ${timeFormat.format(d)}`;
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${timeFormat.format(d)}`;
  return dayFormat.format(d);
}

function ago(ts: number | null, now: number): string {
  if (ts === null) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : timeFormat.format(new Date(ts));
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const projects = useStore((s) => s.projects);
  const currentId = useStore((s) => s.currentId);
  const saveState = useStore((s) => s.saveState);
  const savedAt = useStore((s) => s.savedAt);
  const [query, setQuery] = useState('');
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
    <aside className={styles.sidebar} aria-label="Projects">
      <div className={styles.brand}>
        <LogoIcon />
        <span className={styles.brandName}>CutList</span>
        <span className={styles.spacer} />
        <AppearanceMenu />
      </div>

      <label className={styles.search}>
        <SearchIcon size={16} />
        <input
          type="search"
          placeholder="Search projects and parts"
          aria-label="Search projects and parts"
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
        New project
      </button>

      <div className={styles.sectionTitle}>
        <span>Projects</span>
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
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                useStore.getState().select(p.id);
                onNavigate?.();
              }}
            >
              <span className={styles.projectName}>{p.name || 'Untitled project'}</span>
              {s && s.pieces > 0 && (
                <span className={styles.projectMeta}>
                  {s.pieces} {s.pieces === 1 ? 'part' : 'parts'} · {s.sheets}{' '}
                  {s.sheets === 1 ? 'sheet' : 'sheets'} · {formatNumber(Math.round(s.usedPct))}%
                  used
                </span>
              )}
              <span className={styles.projectDate}>{when(p.updatedAt, now)}</span>
            </button>
          );
        })}
        {shown.length === 0 && <p className={styles.empty}>No projects match “{query}”.</p>}
      </nav>

      <div className={styles.spacerV} />

      <div className={styles.saveState} role="status">
        {saveState === 'error' ? (
          <>
            <WarningIcon size={14} />
            <span>Couldn’t save. Storage may be full.</span>
          </>
        ) : saveState === 'pending' ? (
          <span>Saving…</span>
        ) : (
          <>
            <CheckIcon size={14} />
            <span>Saved in this browser · {ago(savedAt, now)}</span>
          </>
        )}
      </div>
    </aside>
  );
}

function AppearanceMenu() {
  const [appearance, setAppearance] = useState(loadAppearance);
  const update = (patch: Partial<{ theme: Theme; accent: Accent }>) => {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    saveAppearance(next);
  };
  return (
    <Popover
      label={<SettingsIcon />}
      ariaLabel="Appearance"
      triggerClassName={ui.iconButton}
      align="end"
    >
      {() => (
        <div className={styles.appearance}>
          <span className={styles.appearanceLabel}>Theme</span>
          <div className={ui.segmented} role="group" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={appearance.theme === t}
                onClick={() => update({ theme: t })}
              >
                {t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
          <span className={styles.appearanceLabel}>Accent</span>
          <div className={ui.segmented} role="group" aria-label="Accent colour">
            {(['seafoam', 'moss'] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={appearance.accent === a}
                onClick={() => update({ accent: a })}
              >
                {a === 'seafoam' ? 'Seafoam' : 'Moss'}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
