// The back button that sits to the right of a screen's title.
import { useTranslation } from 'react-i18next';
import { useStore, type MainView } from '../store/store';
import { ChevronLeftIcon } from './icons';
import ui from './ui.module.css';

export function BackButton({ to = 'project', label }: { to?: MainView; label?: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={ui.button} onClick={() => useStore.getState().setView(to)}>
      <ChevronLeftIcon size={16} />
      {label ?? t('Back to project')}
    </button>
  );
}
