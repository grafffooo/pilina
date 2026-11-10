// Kerf and edge trim as small chips in the Parts header; each opens a field to change it.
// Read-only once the project is cut.
import { useTranslation } from 'react-i18next';
import { useProjectStatus } from '../app/StatusBadge';
import { formatLengthUnit, unitLabel } from '../lib/units';
import type { Project } from '../model/project';
import { updateProject } from '../store/store';
import { LengthInput } from '../ui/NumberInput';
import { Popover } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import styles from './ProjectSettingChips.module.css';

export function ProjectSettingChips({ project }: { project: Project }) {
  const { t } = useTranslation();
  const locked = useProjectStatus(project).kind === 'cut';
  return (
    <span className={styles.chips}>
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
    </span>
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
