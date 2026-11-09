import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PartsTable } from '../editor/PartsTable';
import { StockTable } from '../editor/StockTable';
import type { Project } from '../model/project';
import {
  CutOrder,
  EmptyResults,
  Results,
  SheetPanel,
  SheetPager,
  StatCards,
  UnplacedBanner,
} from '../results/Results';
import { CostCard } from '../results/CostCard';
import { ExportPdfButton } from '../results/ExportPdfButton';
import { PricingCard } from '../editor/PricingCard';
import { LibraryScreen } from '../library/LibraryScreen';
import { CutMode } from '../cutting/CutMode';
import { StartCuttingButton } from '../cutting/StartCuttingButton';
import { LabelPrint } from '../offcuts/LabelPrint';
import { OffcutLibrary } from '../offcuts/OffcutLibrary';
import { useCurrentProject, useStore } from '../store/store';
import { useMediaQuery } from '../ui/hooks';
import { CloseIcon, MenuIcon, PartsIcon, SawIcon, SheetIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import { ProjectHeader, RunStatus } from './ProjectHeader';
import { Sidebar } from './Sidebar';
import { useOptimizer } from './useOptimizer';
import { usePricing } from './usePricing';
import styles from './App.module.css';

export function App() {
  const ready = useStore((s) => s.ready);
  const project = useCurrentProject();
  const phone = useMediaQuery('(max-width: 767px)');
  const wide = useMediaQuery('(min-width: 1280px)');
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    useStore
      .getState()
      .init()
      .catch((e: unknown) => console.error('Could not open the project database', e));
  }, []);
  const view = useStore((s) => s.view);
  const cutting = useStore((s) => s.cutting);
  useOptimizer();
  usePricing();
  useUndoShortcuts();

  if (!ready || !project) {
    return <div className={styles.loading}>Loading…</div>;
  }

  const openDrawer = wide ? undefined : () => setDrawer(true);

  return (
    <>
      {view !== 'project' ? (
        <div className={styles.desktop}>
          {wide && <Sidebar />}
          {view === 'library' && (
            <LibraryScreen onMenu={wide ? undefined : () => setDrawer(true)} />
          )}
          {view === 'offcuts' && (
            <OffcutLibrary onMenu={wide ? undefined : () => setDrawer(true)} />
          )}
          {view === 'labels' && <LabelPrint onMenu={wide ? undefined : () => setDrawer(true)} />}
        </div>
      ) : phone ? (
        <PhoneLayout project={project} onMenu={() => setDrawer(true)} />
      ) : (
        <div className={styles.desktop}>
          {wide && <Sidebar />}
          <main className={styles.editor}>
            <ProjectHeader project={project} onMenu={openDrawer} />
            <PartsTable project={project} />
            <StockTable project={project} />
            <PricingCard project={project} />
          </main>
          <div className={styles.resultsCol}>
            <Results project={project} />
          </div>
        </div>
      )}
      {drawer && !wide && <Drawer onClose={() => setDrawer(false)} />}
      {cutting && <CutMode />}
    </>
  );
}

type Tab = 'parts' | 'sheets' | 'cut';

function PhoneLayout({ project, onMenu }: { project: Project; onMenu: () => void }) {
  const [tab, setTab] = useState<Tab>('parts');
  const { plan, job, status } = useStore((s) => s.result);
  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'parts', label: 'Parts', icon: <PartsIcon size={22} /> },
    { id: 'sheets', label: 'Sheets', icon: <SheetIcon size={22} /> },
    { id: 'cut', label: 'Cut', icon: <SawIcon size={22} /> },
  ];

  return (
    <div className={styles.phone}>
      <div className={styles.phoneBody}>
        {tab === 'parts' && (
          <>
            <ProjectHeader project={project} onMenu={onMenu} />
            <PartsTable project={project} />
            <StockTable project={project} />
            <PricingCard project={project} />
          </>
        )}
        {tab !== 'parts' && (
          <div className={styles.phoneTop}>
            <button type="button" className={ui.iconButton} aria-label="Projects" onClick={onMenu}>
              <MenuIcon size={22} />
            </button>
            <span className={styles.phoneTitle}>{project.name || 'Untitled project'}</span>
            <RunStatus />
            <ExportPdfButton compact />
          </div>
        )}
        {tab === 'sheets' &&
          (plan && job ? (
            <>
              <StatCards plan={plan} job={job} compact />
              <UnplacedBanner plan={plan} job={job} project={project} />
              {plan.sheets.length > 0 && <SheetPanel plan={plan} project={project} />}
              <CostCard project={project} />
            </>
          ) : (
            <EmptyResults running={status === 'running'} />
          ))}
        {tab === 'cut' &&
          (plan && plan.sheets.length > 0 ? (
            <>
              <StartCuttingButton large />
              <SheetPager plan={plan} />
              <CutOrder plan={plan} title={false} fullHeight />
            </>
          ) : (
            <EmptyResults running={status === 'running'} />
          ))}
      </div>
      <nav className={styles.tabs} aria-label="Sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className={styles.drawerBackdrop}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={styles.drawer}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Projects"
      >
        <button
          type="button"
          className={`${ui.iconButton} ${styles.drawerClose}`}
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  );
}

/** ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo, for the whole project (including while typing). */
function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      // The search field keeps the browser's own text undo.
      if (e.target instanceof Element && e.target.matches('input[type="search"]')) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
