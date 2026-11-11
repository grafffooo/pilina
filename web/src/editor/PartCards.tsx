// The parts list as cards on a phone: size and quantity on top, label and material under it,
// and every field of the row (the table's columns) once a card is opened.
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLength } from '../lib/units';
import { missingPartFields } from '../model/job';
import type { PartRow, Project } from '../model/project';
import { duplicatePart, removePart, updatePart, useStore } from '../store/store';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { CardActions, CardField, CardFields, cardStyles, RowCard } from '../ui/RowCard';
import { SegmentedControl } from '../ui/SegmentedControl';
import { EdgeGlyph, EdgePicker, describeEdges } from './EdgePicker';
import { MaterialSelect } from './MaterialSelect';
import { grainHelp, grainText } from './partFields';
import type { Grain } from '../engine/types';

const GRAINS: Grain[] = ['none', 'length', 'width'];

export function PartCards({
  project,
  showMaterial,
  openId,
  setOpenId,
  onKeyDown,
  onPaste,
}: {
  project: Project;
  showMaterial: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, row: number) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>, part: PartRow) => void;
}) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const size = (v: number | null) => (v === null ? '—' : formatLength(v));

  return (
    <div id="parts-table" className={cardStyles.list}>
      {project.parts.map((p, i) => {
        const missing = missingPartFields(p);
        const name = p.label || t('Part {{n}}', { n: i + 1 });
        const material = materials.find((m) => m.id === p.materialId)?.name;
        const open = openId === p.id;
        const input = (col: 'length' | 'width' | 'qty', label: string) => {
          const Input = col === 'qty' ? NumberInput : LengthInput;
          return (
            <CardField label={label}>
              <Input
                aria-label={`${label}, ${name}`}
                aria-invalid={missing.has(col) || undefined}
                placeholder={label}
                data-row={i}
                data-col={col}
                value={p[col]}
                onCommit={(v) => updatePart(p.id, { [col]: v }, `${p.id}.${col}`)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onPaste={(e) => onPaste(e, p)}
              />
            </CardField>
          );
        };
        return (
          <RowCard
            key={p.id}
            open={open}
            onToggle={() => setOpenId(open ? null : p.id)}
            label={`${name}, ${size(p.length)} × ${size(p.width)}`}
            muted={!p.enabled}
            lead={
              <input
                type="checkbox"
                checked={p.enabled}
                aria-label={t('Include {{name}}', { name })}
                onChange={(e) => updatePart(p.id, { enabled: e.target.checked })}
              />
            }
            title={`${size(p.length)} × ${size(p.width)}`}
            badge={`× ${p.qty ?? '—'}`}
            lines={[
              p.label || t('Label'),
              [material ?? (showMaterial ? t('Any board') : null), grainText(p.grain)]
                .filter(Boolean)
                .join(' · '),
            ]}
            trail={<EdgeGlyph edges={p.edges} size={30} />}
          >
            <CardFields narrowLast>
              {input('length', t('Length'))}
              {input('width', t('Width'))}
              {input('qty', t('Qty'))}
            </CardFields>
            <CardField label={t('Label')}>
              <input
                aria-label={t('Label, part {{n}}', { n: i + 1 })}
                placeholder={t('Label')}
                data-row={i}
                data-col="label"
                value={p.label}
                onChange={(e) => updatePart(p.id, { label: e.target.value }, `${p.id}.label`)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onPaste={(e) => onPaste(e, p)}
              />
            </CardField>
            {showMaterial && (
              <CardField label={t('Material')}>
                <MaterialSelect
                  value={p.materialId}
                  anyLabel={t('Any board')}
                  ariaLabel={t('Material, {{name}}', { name })}
                  onChange={(materialId) => updatePart(p.id, { materialId })}
                />
              </CardField>
            )}
            <div className={cardStyles.field}>
              <span>{t('Grain')}</span>
              <SegmentedControl
                full
                label={t('Grain')}
                value={p.grain}
                options={GRAINS.map((g) => ({ value: g, label: grainText(g) }))}
                onChange={(grain) => updatePart(p.id, { grain })}
              />
              <p className={cardStyles.hint}>{grainHelp(p.grain)}</p>
            </div>
            <div className={cardStyles.field}>
              <span>{t('Edges')}</span>
              <div className={cardStyles.edgeRow}>
                <EdgePicker
                  edges={p.edges}
                  partName={name}
                  bandId={p.edgeBandId}
                  onChange={(edges) => updatePart(p.id, { edges })}
                  onBandChange={(edgeBandId) => updatePart(p.id, { edgeBandId })}
                />
                <span>{describeEdges(p.edges)}</span>
              </div>
            </div>
            <CardActions>
              <button type="button" onClick={() => duplicatePart(p.id)}>
                {t('Duplicate')}
              </button>
              <button type="button" data-danger="" onClick={() => removePart(p.id)}>
                {t('Delete')}
              </button>
            </CardActions>
          </RowCard>
        );
      })}
    </div>
  );
}
