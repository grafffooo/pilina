// Kerf and edge trim as small chips in the Parts header; each opens a field to change it.
// Read-only once the project is cut.
import { useTranslation } from 'react-i18next';
import { useProjectStatus } from '../app/StatusBadge';
import { formatLength, formatLengthUnit, unitLabel } from '../lib/units';
import { resolveTransportProfile } from '../model/job';
import { DEFAULT_TRANSPORT_PROFILES } from '../model/library';
import type { Project } from '../model/project';
import { updateProject, useStore } from '../store/store';
import { LengthInput } from '../ui/NumberInput';
import { Popover } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import styles from './ProjectSettingChips.module.css';

export function ProjectSettingChips({ project }: { project: Project }) {
  const { t } = useTranslation();
  const locked = useProjectStatus(project).kind === 'cut';
  return (
    <span className={styles.chips}>
      <TransportChip project={project} disabled={locked} />
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

export function LinearSettingChips({ project }: { project: Project }) {
  const { t } = useTranslation();
  const locked = useProjectStatus(project).kind === 'cut';
  return (
    <span className={styles.chips}>
      <TransportChip project={project} disabled={locked} />
      <SettingChip
        disabled={locked}
        label={t('Kerf')}
        hint={t('Saw blade thickness')}
        value={project.linearKerf}
        onCommit={(linearKerf) => updateProject({ linearKerf }, 'linearKerf')}
      />
      <SettingChip
        disabled={locked}
        label={t('End trim')}
        hint={t('Trimmed off both ends of each raw bar before cutting')}
        value={project.linearEndTrim}
        onCommit={(linearEndTrim) => updateProject({ linearEndTrim }, 'linearEndTrim')}
      />
    </span>
  );
}

function TransportChip({ project, disabled }: { project: Project; disabled?: boolean }) {
  const { t } = useTranslation();
  const settings = useStore((s) => s.settings);
  const profiles = settings.transportProfiles ?? DEFAULT_TRANSPORT_PROFILES;
  const active = resolveTransportProfile(project, settings);
  const labelFor = (id: string, fallback: string) => {
    if (id === 'car-trunk') return t('Car trunk');
    if (id === 'car-passthrough') return t('Car + pass-through');
    if (id === 'trailer') return t('Trailer');
    return fallback;
  };
  const label = active ? labelFor(active.id, active.name) : t('Full sheets');

  if (disabled) {
    return (
      <span className={`${styles.chip} ${styles.chipStatic}`}>
        {t('Vehicle')}: <strong>{label}</strong>
      </span>
    );
  }
  return (
    <Popover
      title={t('Fit in vehicle')}
      triggerClassName={styles.chip}
      label={
        <>
          {t('Vehicle')}: <strong>{label}</strong>
        </>
      }
    >
      {(close) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
          <button
            type="button"
            className={ui.button}
            aria-pressed={!active}
            style={{ justifyContent: 'space-between' }}
            onClick={() => {
              updateProject({ transportId: null });
              close();
            }}
          >
            <span>{t('Full sheets')}</span>
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              className={ui.button}
              aria-pressed={active?.id === p.id}
              style={{ justifyContent: 'space-between', gap: 10 }}
              onClick={() => {
                updateProject({ transportId: p.id });
                close();
              }}
            >
              <span>{labelFor(p.id, p.name)}</span>
              <span style={{ opacity: 0.7, fontSize: 12 }}>
                {formatLength(p.maxLength)} × {formatLengthUnit(p.maxWidth)}
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
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
      title={label}
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
