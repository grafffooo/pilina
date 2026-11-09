import { useStore, updateProject } from '../store/store';
import type { Project } from '../model/project';
import { CheckIcon, MenuIcon, MoreIcon, RedoIcon, UndoIcon, WarningIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import { Menu, Popover } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import styles from './ProjectHeader.module.css';

export function ProjectHeader({ project, onMenu }: { project: Project; onMenu?: () => void }) {
  return (
    <div className={styles.header}>
      {onMenu && (
        <button type="button" className={ui.iconButton} aria-label="Projects" onClick={onMenu}>
          <MenuIcon size={22} />
        </button>
      )}
      <div className={styles.titleBlock}>
        <input
          className={styles.title}
          aria-label="Project name"
          value={project.name}
          placeholder="Untitled project"
          onChange={(e) => updateProject({ name: e.target.value }, 'name')}
        />
        <div className={styles.chips}>
          <SettingChip
            label="Kerf"
            hint="Saw blade thickness"
            value={project.kerf}
            onCommit={(kerf) => updateProject({ kerf }, 'kerf')}
          />
          <SettingChip
            label="Edge trim"
            hint="Trimmed off every sheet edge before cutting"
            value={project.trim}
            onCommit={(trim) => updateProject({ trim }, 'trim')}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <RunStatus />
        <UndoRedo />
        <Menu
          label={<MoreIcon />}
          ariaLabel="Project actions"
          triggerClassName={ui.iconButton}
          items={[
            {
              label: 'Duplicate project',
              onSelect: () => useStore.getState().duplicateProject(project.id),
            },
            {
              label: 'Delete project…',
              danger: true,
              onSelect: () => {
                const name = project.name || 'Untitled project';
                if (window.confirm(`Delete “${name}”? This can’t be undone.`)) {
                  void useStore.getState().deleteProject(project.id);
                }
              },
            },
          ]}
        />
      </div>
    </div>
  );
}

function SettingChip({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  return (
    <Popover
      triggerClassName={styles.chip}
      label={
        <>
          {label} <strong>{value} mm</strong>
        </>
      }
    >
      {(close) => (
        <label className={ui.field}>
          {hint}
          <span className={styles.fieldRow}>
            <NumberInput
              className={ui.fieldInput}
              value={value}
              onCommit={(v) => onCommit(Math.max(0, v ?? 0))}
              onKeyDown={(e) => e.key === 'Enter' && close()}
            />
            mm
          </span>
        </label>
      )}
    </Popover>
  );
}

export function RunStatus() {
  const status = useStore((s) => s.result.status);
  if (status === 'empty') return null;
  if (status === 'error') {
    return (
      <span className={styles.statusError} role="status">
        <WarningIcon size={14} />
        Engine error
      </span>
    );
  }
  return (
    <span className={status === 'running' ? styles.statusBusy : styles.statusOk} role="status">
      {status === 'running' ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          Optimizing…
        </>
      ) : (
        <>
          <CheckIcon size={14} />
          Up to date
        </>
      )}
    </span>
  );
}

function UndoRedo() {
  const canUndo = useStore((s) => s.history.past.length > 0);
  const canRedo = useStore((s) => s.history.future.length > 0);
  const mac = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform);
  return (
    <>
      <button
        type="button"
        className={ui.iconButton}
        aria-label="Undo"
        title={mac ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
        disabled={!canUndo}
        onClick={() => useStore.getState().undo()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className={ui.iconButton}
        aria-label="Redo"
        title={mac ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Y)'}
        disabled={!canRedo}
        onClick={() => useStore.getState().redo()}
      >
        <RedoIcon />
      </button>
    </>
  );
}
