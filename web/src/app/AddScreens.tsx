// The "Add" screens on a phone: a part, a board, an edge band or an offcut, each a full screen with
// a live preview, labelled fields and "Add another" / "Add". They replace the table's blank row and
// the popover form; the desktop keeps both.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Grain } from '../engine/types';
import { EdgeGlyph, EdgePicker, describeEdges } from '../editor/EdgePicker';
import { MaterialSelect } from '../editor/MaterialSelect';
import { grainHelp, grainText } from '../editor/partFields';
import { exact, formatPrice } from '../library/priceFormat';
import {
  areaPriceIn,
  areaPriceOut,
  areaUnit,
  formatLength,
  isImperial,
  longPriceIn,
  unitLabel,
} from '../lib/units';
import { formatMoney } from '../model/library';
import { isBlankPart, emptyPart, type PartRow } from '../model/project';
import {
  addEdgeBand,
  addMaterial,
  insertParts,
  replacePart,
  updateEdgeBand,
  updateMaterial,
  useCurrentProject,
  useStore,
} from '../store/store';
import { ComboInput } from '../ui/ComboInput';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { CardField, CardFields, cardStyles } from '../ui/RowCard';
import { SegmentedControl } from '../ui/SegmentedControl';
import { TaskScreen } from '../ui/TaskScreen';
import { usePlaces } from '../offcuts/places';
import styles from './AddScreens.module.css';

const GRAINS: Grain[] = ['none', 'length', 'width'];

function ActionButtons({
  ok,
  again,
  done,
  label,
}: {
  ok: boolean;
  again: () => void;
  done: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <button type="button" disabled={!ok} onClick={again}>
        {t('Add another')}
      </button>
      <button type="button" data-primary="" disabled={!ok} onClick={done}>
        {label}
      </button>
    </>
  );
}

/** The part drawn to scale, its banded edges thick (the same way the edge glyph shows them). */
function PartDrawing({ part }: { part: PartRow }) {
  const L = part.length ?? 0;
  const W = part.width ?? 0;
  const ok = L > 0 && W > 0;
  const k = ok ? Math.min(100 / L, 76 / W) : 0;
  const h = ok ? L * k : 60;
  const w = ok ? W * k : 40;
  const x = (120 - w) / 2;
  const y = (96 - h) / 2;
  const on = 'var(--accent)';
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} fill="#f1e7cb" stroke="#6a5b4a" />
      {part.edges.top && <path d={`M${x} ${y}v${h}`} stroke={on} strokeWidth="5" />}
      {part.edges.bottom && <path d={`M${x + w} ${y}v${h}`} stroke={on} strokeWidth="5" />}
      {part.edges.left && <path d={`M${x} ${y}h${w}`} stroke={on} strokeWidth="5" />}
      {part.edges.right && <path d={`M${x} ${y + h}h${w}`} stroke={on} strokeWidth="5" />}
    </svg>
  );
}

export function AddPartScreen() {
  const { t } = useTranslation();
  const project = useCurrentProject();
  const [part, setPart] = useState<PartRow>(() => emptyPart());
  const set = (patch: Partial<PartRow>) => setPart((p) => ({ ...p, ...patch }));
  const ok = !!part.length && !!part.width && (part.qty ?? 0) > 0;
  const size = (v: number | null) => (v === null ? '—' : formatLength(v));

  const save = (again: boolean) => {
    // The project's empty first row is used up before a new one is added.
    const blank = project?.parts.find(isBlankPart);
    if (blank) replacePart(blank.id, [part]);
    else insertParts([part]);
    if (again) {
      setPart({
        ...emptyPart(),
        materialId: part.materialId,
        grain: part.grain,
        edgeBandId: part.edgeBandId,
      });
    } else history.back();
  };

  return (
    <TaskScreen
      title={t('Add part')}
      actions={
        <ActionButtons
          ok={ok}
          again={() => save(true)}
          done={() => save(false)}
          label={t('Add part')}
        />
      }
    >
      <div className={styles.preview}>
        <PartDrawing part={part} />
        <div className={styles.previewText}>
          <span className={styles.previewTitle}>
            {size(part.length)} × {size(part.width)}
          </span>
          <span>
            × {part.qty ?? '—'} · {grainText(part.grain)}
          </span>
          <span>{describeEdges(part.edges)}</span>
        </div>
      </div>
      <CardField label={t('Label')}>
        <input
          aria-label={t('Label')}
          placeholder={t('Label')}
          enterKeyHint="next"
          value={part.label}
          onChange={(e) => set({ label: e.target.value })}
        />
      </CardField>
      <CardFields narrowLast>
        <CardField label={t('Length')}>
          <LengthInput
            aria-label={t('Length')}
            placeholder={t('Length')}
            value={part.length}
            onCommit={(length) => set({ length })}
          />
        </CardField>
        <CardField label={t('Width')}>
          <LengthInput
            aria-label={t('Width')}
            placeholder={t('Width')}
            value={part.width}
            onCommit={(width) => set({ width })}
          />
        </CardField>
        <CardField label={t('Qty')}>
          <NumberInput
            aria-label={t('Qty')}
            placeholder={t('Qty')}
            value={part.qty}
            onCommit={(qty) => set({ qty })}
          />
        </CardField>
      </CardFields>
      <CardField label={t('Material')}>
        <MaterialSelect
          value={part.materialId}
          anyLabel={t('Any board')}
          ariaLabel={t('Material')}
          onChange={(materialId) => set({ materialId })}
        />
      </CardField>
      <div className={cardStyles.field}>
        <span>{t('Grain')}</span>
        <SegmentedControl
          full
          label={t('Grain')}
          value={part.grain}
          options={GRAINS.map((g) => ({ value: g, label: grainText(g) }))}
          onChange={(grain) => set({ grain })}
        />
        <p className={cardStyles.hint}>{grainHelp(part.grain)}</p>
      </div>
      <div className={cardStyles.field}>
        <span>{t('Edges')}</span>
        <EdgePicker
          edges={part.edges}
          partName={part.label || t('Part {{n}}', { n: (project?.parts.length ?? 0) + 1 })}
          bandId={part.edgeBandId}
          onChange={(edges) => set({ edges })}
          onBandChange={(edgeBandId) => set({ edgeBandId })}
          triggerClassName={styles.rowButton}
          trigger={
            <>
              <EdgeGlyph edges={part.edges} size={28} />
              <span className={styles.rowText}>{describeEdges(part.edges)}</span>
            </>
          }
        />
      </div>
    </TaskScreen>
  );
}

export function AddBoardScreen() {
  const { t } = useTranslation();
  const currency = useStore((s) => s.settings.currency);
  const count = useStore((s) => s.materials.length);
  const [name, setName] = useState('');
  const [thickness, setThickness] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [unit, setUnit] = useState<'sheet' | 'sqm'>('sheet');
  const [sl, setSl] = useState<number | null>(2800);
  const [sw, setSw] = useState<number | null>(2070);
  const [grain, setGrain] = useState<Grain>('length');
  const [color, setColor] = useState(() => '#e6dcf0');
  const ok = name.trim() !== '';

  const area = sl && sw ? (sl * sw) / 1e6 : null;
  const perSqm =
    price === null ? null : unit === 'sqm' ? areaPriceIn(price) : area ? price / area : null;
  const perSheet =
    price === null ? null : unit === 'sheet' ? price : area ? areaPriceIn(price) * area : null;

  const save = (again: boolean) => {
    const m = addMaterial(name.trim(), sl && sw ? { length: sl, width: sw } : undefined);
    updateMaterial(m.id, {
      thickness,
      price: price === null ? null : unit === 'sqm' ? areaPriceIn(price) : price,
      priceUnit: unit,
      grain,
      color,
    });
    if (again) {
      setName('');
      setPrice(null);
      setThickness(null);
    } else history.back();
    void count;
  };

  return (
    <TaskScreen
      title={t('Add board')}
      actions={
        <ActionButtons
          ok={ok}
          again={() => save(true)}
          done={() => save(false)}
          label={t('Add board')}
        />
      }
    >
      <div className={styles.preview}>
        <span className={styles.swatch} style={{ background: color }} aria-hidden="true" />
        <div className={styles.previewText}>
          <span className={styles.previewTitle}>{name || t('New board')}</span>
          <span>
            {perSheet === null ? '—' : `${formatMoney(perSheet, currency)} / ${t('sheet')}`}
          </span>
          <span>
            {perSqm === null
              ? ''
              : `${formatMoney(exact(areaPriceOut(perSqm)), currency)} / ${areaUnit()}`}
          </span>
        </div>
      </div>
      <CardField label={t('Name')}>
        <input
          aria-label={t('Board name')}
          value={name}
          style={{ textAlign: 'start' }}
          onChange={(e) => setName(e.target.value)}
        />
      </CardField>
      <CardFields>
        <CardField label={`${t('Thickness')} (${unitLabel()})`}>
          <LengthInput aria-label={t('Thickness')} value={thickness} onCommit={setThickness} />
        </CardField>
        <CardField label={t('Price')}>
          <NumberInput
            aria-label={t('Price')}
            placeholder="—"
            format={formatPrice}
            value={price}
            onCommit={setPrice}
          />
        </CardField>
      </CardFields>
      <div className={cardStyles.field}>
        <span>{t('Per')}</span>
        <SegmentedControl
          full
          label={t('Per')}
          value={unit}
          options={[
            { value: 'sheet', label: t('sheet') },
            { value: 'sqm', label: areaUnit() },
          ]}
          onChange={setUnit}
        />
      </div>
      <CardFields>
        <CardField label={`${t('For sheet size')}: ${t('Length')}`}>
          <LengthInput aria-label={t('Length')} value={sl} onCommit={setSl} />
        </CardField>
        <CardField label={`${t('For sheet size')}: ${t('Width')}`}>
          <LengthInput aria-label={t('Width')} value={sw} onCommit={setSw} />
        </CardField>
      </CardFields>
      <div className={cardStyles.field}>
        <span>{t('Grain')}</span>
        <SegmentedControl
          full
          label={t('Grain')}
          value={grain}
          options={[
            { value: 'length', label: t('Length') },
            { value: 'width', label: t('Width') },
            { value: 'none', label: t('No grain') },
          ]}
          onChange={setGrain}
        />
      </div>
      <CardField label={t('Colour')}>
        <input
          type="color"
          aria-label={t('Colour')}
          value={color}
          style={{ textAlign: 'start' }}
          onChange={(e) => setColor(e.target.value)}
        />
      </CardField>
    </TaskScreen>
  );
}

export function AddEdgeBandScreen() {
  const { t } = useTranslation();
  const currency = useStore((s) => s.settings.currency);
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const ok = name.trim() !== '';
  const metre = isImperial() ? 'ft' : 'm';

  const save = (again: boolean) => {
    const b = addEdgeBand();
    updateEdgeBand(b.id, {
      name: name.trim(),
      pricePerMetre: price === null ? null : longPriceIn(price),
    });
    if (again) {
      setName('');
      setPrice(null);
    } else history.back();
  };

  return (
    <TaskScreen
      title={t('Add edge band')}
      actions={
        <ActionButtons
          ok={ok}
          again={() => save(true)}
          done={() => save(false)}
          label={t('Add edge band')}
        />
      }
    >
      <div className={styles.preview}>
        <div className={styles.previewText}>
          <span className={styles.previewTitle}>{name || t('New edge band')}</span>
          <span>{price === null ? '—' : `${formatMoney(price, currency)} / ${metre}`}</span>
        </div>
      </div>
      <CardField label={t('Name')}>
        <input
          aria-label={t('Edge band name')}
          value={name}
          style={{ textAlign: 'start' }}
          onChange={(e) => setName(e.target.value)}
        />
      </CardField>
      <CardField label={isImperial() ? t('Price per foot') : t('Price per metre')}>
        <NumberInput
          aria-label={isImperial() ? t('Price per foot') : t('Price per metre')}
          placeholder="—"
          format={formatPrice}
          value={price}
          onCommit={setPrice}
        />
      </CardField>
    </TaskScreen>
  );
}

export function AddOffcutScreen() {
  const { t } = useTranslation();
  const places = usePlaces();
  const minL = useStore((s) => s.settings.offcutMinLength);
  const minW = useStore((s) => s.settings.offcutMinWidth);
  const [length, setLength] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [grain, setGrain] = useState<Grain>('length');
  const ok = !!length && !!width && length > 0 && width > 0;
  const big = ok && ((length! >= minL && width! >= minW) || (width! >= minL && length! >= minW));

  const save = (again: boolean) => {
    useStore
      .getState()
      .addOffcuts([{ length: length!, width: width!, materialId, location, grain }]);
    if (again) {
      setLength(null);
      setWidth(null);
    } else history.back();
  };

  return (
    <TaskScreen
      title={t('Add offcut')}
      subtitle={t('Add an offcut by hand')}
      actions={
        <ActionButtons
          ok={ok}
          again={() => save(true)}
          done={() => save(false)}
          label={t('Add offcut')}
        />
      }
    >
      <div className={styles.preview}>
        <div className={styles.previewText}>
          <span className={styles.previewTitle}>
            {ok ? `${formatLength(length!)} × ${formatLength(width!)}` : '—'}
          </span>
          <span>{ok && !big ? t('Smaller than the reusable size') : ''}</span>
        </div>
      </div>
      <CardField label={t('Material')}>
        <MaterialSelect
          value={materialId}
          anyLabel={t('No material')}
          ariaLabel={t('Material')}
          onChange={setMaterialId}
        />
      </CardField>
      <CardFields>
        <CardField label={t('Length')}>
          <LengthInput
            aria-label={t('Length')}
            placeholder={t('Length')}
            value={length}
            onCommit={setLength}
          />
        </CardField>
        <CardField label={t('Width')}>
          <LengthInput
            aria-label={t('Width')}
            placeholder={t('Width')}
            value={width}
            onCommit={setWidth}
          />
        </CardField>
      </CardFields>
      <div className={cardStyles.field}>
        <span>{t('Grain')}</span>
        <SegmentedControl
          full
          label={t('Grain')}
          value={grain}
          options={[
            { value: 'length', label: t('Length') },
            { value: 'width', label: t('Width') },
            { value: 'none', label: t('No grain') },
          ]}
          onChange={setGrain}
        />
      </div>
      <CardField label={t('Place')}>
        <ComboInput
          aria-label={t('Place')}
          placeholder={t('Place, e.g. Rack A')}
          options={places}
          value={location}
          onChange={setLocation}
        />
      </CardField>
    </TaskScreen>
  );
}
