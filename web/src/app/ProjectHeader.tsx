import { useState } from 'react';
import { createPortal } from 'react-dom';
import { confirmDialog } from '../ui/dialogs';
import { formatLengthUnit, unitLabel } from '../lib/units';
import { useStore, updateProject } from '../store/store';
import type { Project } from '../model/project';
import {
  CheckIcon,
  MenuIcon,
  MoreIcon,
  RedoIcon,
  ShareIcon,
  UndoIcon,
  WarningIcon,
} from '../ui/icons';
import { LengthInput } from '../ui/NumberInput';
import { Menu, Popover } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import styles from './ProjectHeader.module.css';
import { ShareDialog } from './ShareDialog';
import { cutDate, setProjectCut, StatusBadge, useProjectStatus } from './StatusBadge';
import { useTranslation } from 'react-i18next';

export function ProjectHeader({ project, onMenu }: { project: Project; onMenu?: () => void }) {
  const { t } = useTranslation();
  const status = useProjectStatus(project);
  const locked = status.kind === 'cut';
  const [sharing, setSharing] = useState(false);
  return (
    <div className={styles.header}>
      {onMenu && (
        <button type="button" className={ui.iconButton} aria-label={t('Projects')} onClick={onMenu}>
          <MenuIcon size={22} />
        </button>
      )}
      <div className={styles.titleBlock}>
        <input
          className={styles.title}
          aria-label={t('Project name')}
          value={project.name}
          placeholder={t('Untitled project')}
          readOnly={locked}
          onChange={(e) => updateProject({ name: e.target.value }, 'name')}
        />
        <div className={styles.chips}>
          <StatusBadge status={status} />
          <SettingChip
            disabled={locked}
            label={t('Kerf')}
            hint={t('Saw blade thickness')}
            value={project.kerf}
            onCommit={(kerf) => updateProject({ kerf }, 'kerf')}
          />
          <SettingChip
            disabled={locked}
            label={t('Edge trim')}
            hint={t('Trimmed off every sheet edge before cutting')}
            value={project.trim}
            onCommit={(trim) => updateProject({ trim }, 'trim')}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <RunStatus />
        <UndoRedo />
        <button
          type="button"
          className={ui.iconButton}
          aria-label={t('Share')}
          title={t('Share')}
          aria-haspopup="dialog"
          onClick={() => setSharing(true)}
        >
          <ShareIcon />
        </button>
        <Menu
          label={<MoreIcon />}
          ariaLabel={t('Project actions')}
          triggerClassName={ui.iconButton}
          items={[
            locked
              ? { label: t('Back to draft'), onSelect: () => setProjectCut(project, false) }
              : { label: t('Mark as cut'), onSelect: () => setProjectCut(project, true) },
            {
              label: t('Duplicate project'),
              onSelect: () => useStore.getState().duplicateProject(project.id),
            },
            { label: t('Share or export…'), onSelect: () => setSharing(true) },
            {
              label: t('Delete project…'),
              danger: true,
              onSelect: async () => {
                const name = project.name || t('Untitled project');
                const ok = await confirmDialog({
                  title: t('Delete project?'),
                  message: t('Delete “{{name}}”? This can’t be undone.', { name }),
                  confirmLabel: t('Delete'),
                  danger: true,
                });
                if (ok) void useStore.getState().deleteProject(project.id);
              },
            },
          ]}
        />
      </div>
      {sharing &&
        createPortal(
          <ShareDialog project={project} onClose={() => setSharing(false)} />,
          document.body,
        )}
      {status.kind === 'cut' && (
        <div className={styles.cutBanner} role="note">
          <CheckIcon size={16} />
          <span>
            {t('Cut on {{date}}. The project is locked so its layout and costs stay as cut.', {
              date: cutDate(status.at),
            })}
          </span>
          <button type="button" className={ui.button} onClick={() => setProjectCut(project, false)}>
            {t('Edit as draft')}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingChip({
  label,
  hint,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className={`${styles.chip} ${styles.chipStatic}`}>
        {label} <strong>{formatLengthUnit(value)}</strong>
      </span>
    );
  }
  return (
    <Popover
      triggerClassName={styles.chip}
      label={
        <>
          {label} <strong>{formatLengthUnit(value)}</strong>
        </>
      }
    >
      {(close) => (
        <label className={ui.field}>
          {hint}
          <span className={styles.fieldRow}>
            <LengthInput
              className={ui.fieldInput}
              value={value}
              onCommit={(v) => onCommit(Math.max(0, v ?? 0))}
              onKeyDown={(e) => e.key === 'Enter' && close()}
            />
            {unitLabel()}
          </span>
        </label>
      )}
    </Popover>
  );
}

export function RunStatus() {
  const { t } = useTranslation();
  const status = useStore((s) => s.result.status);
  if (status === 'empty') return null;
  if (status === 'error') {
    return (
      <span className={styles.statusError} role="status">
        <WarningIcon size={14} />
        {t('Engine error')}
      </span>
    );
  }
  return (
    <span className={status === 'running' ? styles.statusBusy : styles.statusOk} role="status">
      {status === 'running' ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          {t('Optimizing…')}
        </>
      ) : (
        <>
          <CheckIcon size={14} />
          {t('Up to date')}
        </>
      )}
    </span>
  );
}

function UndoRedo() {
  const { t } = useTranslation();
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const mac = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform);
  return (
    <>
      <button
        type="button"
        className={ui.iconButton}
        aria-label={t('Undo')}
        title={`${t('Undo')} (${mac ? '⌘Z' : 'Ctrl+Z'})`}
        disabled={!canUndo}
        onClick={() => useStore.getState().undo()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className={ui.iconButton}
        aria-label={t('Redo')}
        title={`${t('Redo')} (${mac ? '⇧⌘Z' : 'Ctrl+Y'})`}
        disabled={!canRedo}
        onClick={() => useStore.getState().redo()}
      >
        <RedoIcon />
      </button>
    </>
  );
}
