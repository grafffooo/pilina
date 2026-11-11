// The phone's bottom bar: Projects (the app icon), then the open project's Parts, Sheets and Cut.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type PhoneTab } from '../store/store';
import { LogoIcon, PartsIcon, SawIcon, SheetIcon } from '../ui/icons';
import styles from './BottomBar.module.css';

export function BottomBar() {
  const { t } = useTranslation();
  const view = useStore((s) => s.view);
  const tab = useStore((s) => s.phoneTab);
  // Task screens (add forms, label printing) have their own back arrow and bottom action.
  if (view === 'labels' || view.startsWith('add-')) return null;
  const projects = view === 'projects' || view === 'archive' || view === 'settings';
  const sections: { id: PhoneTab; label: string; icon: ReactNode }[] = [
    { id: 'parts', label: t('Parts'), icon: <PartsIcon size={24} /> },
    { id: 'sheets', label: t('Sheets'), icon: <SheetIcon size={24} /> },
    { id: 'cut', label: t('Cut'), icon: <SawIcon size={24} /> },
  ];

  return (
    <nav className={styles.bar} aria-label={t('Sections')}>
      <button
        type="button"
        aria-current={projects ? 'page' : undefined}
        onClick={() => useStore.getState().setView('projects')}
      >
        <span className={styles.logo}>
          <LogoIcon size={22} />
        </span>
        {t('Projects')}
      </button>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-current={view === 'project' && tab === s.id ? 'page' : undefined}
          onClick={() => {
            const state = useStore.getState();
            state.setPhoneTab(s.id);
            state.setView('project');
          }}
        >
          {s.icon}
          {s.label}
        </button>
      ))}
    </nav>
  );
}
