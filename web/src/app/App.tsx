import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LinearPartsTable } from '../editor/LinearPartsTable';
import { PartsTable } from '../editor/PartsTable';
import editorStyles from '../editor/Editor.module.css';
import {
  hasLinearContent,
  isBlankPart,
  type Project,
} from '../model/project';
import {
  CutOrder,
  CutOrderSetting,
  EmptyResults,
  Results,
  SheetPanel,
  SheetPager,
  StatCards,
  UnplacedBanner,
} from '../results/Results';
import {
  BarPager,
  BarPanel,
  EmptyLinearResults,
  LinearCutOrder,
  LinearStatCards,
  LinearUnplacedBanner,
} from '../results/LinearResults';
import { CostCard } from '../results/CostCard';
import { ExportPdfButton } from '../results/ExportPdfButton';
import { StoreSawCard } from '../results/StoreSawCard';
import { PricingCard } from '../editor/PricingCard';
import { LibraryScreen } from '../library/LibraryScreen';
import { CutMode } from '../cutting/CutMode';
import { StartCuttingButton } from '../cutting/StartCuttingButton';
import { LabelPrint } from '../offcuts/LabelPrint';
import { OffcutLibrary } from '../offcuts/OffcutLibrary';
import { StatsScreen } from '../stats/StatsScreen';
import { useCurrentProject, useStore } from '../store/store';
import { useView } from '../store/view';
import { useMediaQuery } from '../ui/hooks';
import { CloseIcon } from '../ui/icons';
import { SegmentedControl } from '../ui/SegmentedControl';
import ui from '../ui/ui.module.css';
import { ProjectHeader, RunStatus } from './ProjectHeader';
import { useProjectStatus } from './StatusBadge';
import { Sidebar } from './Sidebar';
import {
  AddBoardScreen,
  AddEdgeBandScreen,
  AddLinearMaterialScreen,
  AddLinearPartScreen,
  AddOffcutScreen,
  AddPartScreen,
} from './AddScreens';
import { BottomBar } from './BottomBar';
import { ImportHost } from './importHost';
import { CutArchiveScreen, ProjectsScreen } from './ProjectsScreen';
import { SettingsScreen } from './SettingsScreen';
import { PwaNotices } from './Pwa';
import { isDesktopApp } from '../lib/platform';
import { confirmDialog, DialogHost } from '../ui/dialogs';
import { importProjectFile } from '../model/importExport';
import { readProjectLink } from '../model/shareLink';
import { startFolderSync } from '../sync/folderSync';
import { t as i18nT } from '../i18n';
import { useLinearOptimizer } from './useLinearOptimizer';
import { useOptimizer } from './useOptimizer';
import { usePricing } from './usePricing';
import styles from './App.module.css';
import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
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
  // Sizes are formatted in the workshop's unit: draw everything again when it changes.
  useStore((s) => s.settings.units);
  useOptimizer();
  useLinearOptimizer();
  usePricing();
  useUndoShortcuts();
  useProjectFromLink(ready);
  useEffect(() => {
    if (ready) void startFolderSync();
  }, [ready]);
  useEffect(() => {
    if (!project) return;
    const hasSheets = project.parts.some((p) => !isBlankPart(p));
    useView
      .getState()
      .setActiveKind(!hasSheets && hasLinearContent(project) ? 'linear' : 'sheets');
    // Reset active view tab when opening a different project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (!ready || !project) {
    return <div className={styles.loading}>{t('Loading…')}</div>;
  }

  // The drawer is for desktop layouts narrower than the wide one; a phone has the bottom bar.
  const openDrawer = wide || phone ? undefined : () => setDrawer(true);
  // Phone-only screens fall back to the project when the window grows past a phone.
  const deskView =
    view === 'projects' || view === 'archive' || view === 'settings' ? 'project' : view;

  return (
    <>
      {phone ? (
        <PhoneApp project={project} />
      ) : deskView !== 'project' ? (
        <div className={styles.desktop}>
          {wide && <Sidebar />}
          {deskView === 'library' && <LibraryScreen onMenu={openDrawer} />}
          {deskView === 'offcuts' && <OffcutLibrary onMenu={openDrawer} />}
          {deskView === 'labels' && <LabelPrint onMenu={openDrawer} />}
          {deskView === 'stats' && <StatsScreen onMenu={openDrawer} />}
        </div>
      ) : (
        <div className={styles.desktop}>
          {wide && <Sidebar />}
          <main className={styles.editor}>
            <ProjectHeader project={project} onMenu={openDrawer} />
            <ProjectEditor project={project} />
          </main>
          <div className={styles.resultsCol}>
            <Results project={project} />
          </div>
        </div>
      )}
      {drawer && !wide && !phone && <Drawer onClose={() => setDrawer(false)} />}
      {cutting && <CutMode />}
      {!isDesktopApp() && <PwaNotices />}
      <DialogHost />
      <ImportHost />
    </>
  );
}

/** The phone: the bottom bar plus one screen at a time. */
function PhoneApp({ project }: { project: Project }) {
  const view = useStore((s) => s.view);
  const tab = useStore((s) => s.phoneTab);
  // Every screen starts at its top (the page scrolls as one, so it would keep the last offset).
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [view, tab]);
  return (
    <>
      {view === 'project' && <PhoneLayout project={project} />}
      {view === 'projects' && <ProjectsScreen />}
      {view === 'archive' && <CutArchiveScreen />}
      {view === 'settings' && <SettingsScreen />}
      {view === 'add-part' && <AddPartScreen />}
      {view === 'add-linear-part' && <AddLinearPartScreen />}
      {view === 'add-board' && <AddBoardScreen />}
      {view === 'add-linear-material' && <AddLinearMaterialScreen />}
      {view === 'add-band' && <AddEdgeBandScreen />}
      {view === 'add-offcut' && <AddOffcutScreen />}
      {(view === 'library' || view === 'offcuts' || view === 'labels' || view === 'stats') && (
        <div className={styles.phone}>
          {view === 'library' && <LibraryScreen />}
          {view === 'offcuts' && <OffcutLibrary />}
          {view === 'labels' && <LabelPrint />}
          {view === 'stats' && <StatsScreen />}
        </div>
      )}
      <BottomBar />
    </>
  );
}

/** Parts, stock and pricing; read-only once the project is cut. */
function ProjectEditor({ project }: { project: Project }) {
  const { t } = useTranslation();
  const phone = useMediaQuery('(max-width: 767px)');
  const locked = useProjectStatus(project).kind === 'cut';
  const activeKind = useView((s) => s.activeKind);
  const setActiveKind = useView((s) => s.setActiveKind);

  return (
    <fieldset className={styles.editorFields} disabled={locked}>
      <div className={editorStyles.modeBar}>
        <SegmentedControl
          full={phone}
          label={t('Stock type')}
          value={activeKind}
          options={[
            { value: 'sheets', label: t('Sheets') },
            { value: 'linear', label: t('Linear stock') },
          ]}
          onChange={setActiveKind}
        />
      </div>
      {activeKind === 'linear' ? (
        <LinearPartsTable project={project} />
      ) : (
        <PartsTable project={project} />
      )}
      <PricingCard project={project} />
    </fieldset>
  );
}

function PhoneLayout({ project }: { project: Project }) {
  const { t } = useTranslation();
  const tab = useStore((s) => s.phoneTab);
  const { plan, job, status } = useStore((s) => s.result);
  const {
    plan: linearPlan,
    job: linearJob,
    status: linearStatus,
  } = useStore((s) => s.linearResult);
  const activeKind = useView((s) => s.activeKind);
  const setActiveKind = useView((s) => s.setActiveKind);

  return (
    <div className={styles.phone}>
      <div className={styles.phoneBody}>
        {tab === 'parts' && (
          <>
            <ProjectHeader project={project} />
            <ProjectEditor project={project} />
          </>
        )}
        {tab !== 'parts' && (
          <>
            <div className={styles.phoneTop}>
              <span className={styles.phoneTitle}>{project.name || t('Untitled project')}</span>
              <RunStatus />
              <ExportPdfButton compact />
            </div>
            <SegmentedControl
              full
              label={t('Stock type')}
              value={activeKind}
              options={[
                { value: 'sheets', label: t('Sheets') },
                { value: 'linear', label: t('Linear stock') },
              ]}
              onChange={setActiveKind}
            />
          </>
        )}
        {tab === 'sheets' && <StoreSawCard project={project} />}
        {tab === 'sheets' &&
          (activeKind === 'linear' ? (
            linearPlan && linearJob ? (
              <>
                <LinearStatCards plan={linearPlan} job={linearJob} compact />
                <LinearUnplacedBanner plan={linearPlan} job={linearJob} project={project} />
                {linearPlan.bars.length > 0 && <BarPanel plan={linearPlan} project={project} />}
                <CostCard project={project} />
              </>
            ) : (
              <EmptyLinearResults running={linearStatus === 'running'} />
            )
          ) : plan && job ? (
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
          (activeKind === 'linear' ? (
            linearPlan && linearPlan.bars.length > 0 ? (
              <>
                <BarPager plan={linearPlan} />
                <LinearCutOrder plan={linearPlan} title={false} fullHeight />
                <StartCuttingButton large kind="linear" />
              </>
            ) : (
              <EmptyLinearResults running={linearStatus === 'running'} />
            )
          ) : plan && plan.sheets.length > 0 ? (
            <>
              <CutOrderSetting />
              <SheetPager plan={plan} />
              <CutOrder plan={plan} title={false} fullHeight />
              <StartCuttingButton large />
            </>
          ) : (
            <EmptyResults running={status === 'running'} />
          ))}
      </div>
    </div>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
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
        aria-label={t('Projects')}
      >
        <button
          type="button"
          className={`${ui.iconButton} ${styles.drawerClose}`}
          aria-label={t('Close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  );
}

/** A shared link (#import=…) offers to add the project it carries. */
function useProjectFromLink(ready: boolean) {
  useEffect(() => {
    if (!ready || !location.hash.startsWith('#import=')) return;
    const hash = location.hash;
    // Forget the link first, so a reload doesn't ask again.
    history.replaceState(null, '', location.pathname + location.search);
    void (async () => {
      try {
        const file = await readProjectLink(hash);
        if (!file) return;
        const name = file.project.name || i18nT('Untitled project');
        const ok = await confirmDialog({
          title: i18nT('Add shared project?'),
          message: i18nT('“{{name}}” was shared with you. Add it to your projects?', { name }),
          confirmLabel: i18nT('Add project'),
        });
        if (!ok) return;
        const state = useStore.getState();
        const r = importProjectFile(
          file,
          state.materials,
          state.edgeBands,
          new Set(state.projects.map((p) => p.id)),
        );
        state.importProjects([r.project], r.newMaterials, r.newEdgeBands);
      } catch (e) {
        console.error('Could not read the shared link', e);
        await confirmDialog({
          title: i18nT('Couldn’t open the link'),
          message: i18nT('The link seems incomplete. Ask for the project file instead.'),
          confirmLabel: i18nT('OK'),
        });
      }
    })();
  }, [ready]);
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
