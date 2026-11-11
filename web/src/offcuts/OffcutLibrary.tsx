// Offcut library: every kept leftover with its ID, size, material, place and label state.
import { useMemo, useState } from 'react';
import { formatArea, formatLength, unitLabel } from '../lib/units';
import type { Offcut, OffcutStatus } from '../model/offcut';
import { useStore } from '../store/store';
import { MenuIcon, MoreIcon, PlusIcon, ScanIcon, SearchIcon } from '../ui/icons';
import { canScan, ScanDialog } from './ScanDialog';
import { LengthInput } from '../ui/NumberInput';
import { ComboInput } from '../ui/ComboInput';
import { confirmDialog } from '../ui/dialogs';
import { Menu, Popover } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import { BackButton } from '../ui/BackButton';
import editor from '../editor/Editor.module.css';
import { MaterialSelect } from '../editor/MaterialSelect';
import { useMediaQuery } from '../ui/hooks';
import { CardActions, CardField, cardStyles, RowCard } from '../ui/RowCard';
import { locale, t as i18nT } from '../i18n';
import styles from './Offcuts.module.css';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { Grain } from '../engine/types';

const statusText = (s: OffcutStatus) =>
  s === 'available' ? i18nT('Available') : s === 'reserved' ? i18nT('Reserved') : i18nT('Used');

const dateFormat = () => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });

/** Places to offer: the saved ones, then any other place an offcut is stored in. */
function usePlaces(): string[] {
  const saved = useStore((s) => s.settings.locations);
  const offcuts = useStore((s) => s.offcuts);
  return useMemo(() => {
    const seen = new Set(saved.map((l) => l.toLowerCase()));
    const extra = [...new Set(offcuts.map((o) => o.location.trim()).filter(Boolean))]
      .filter((l) => !seen.has(l.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    return [...saved, ...extra];
  }, [saved, offcuts]);
}

export function OffcutLibrary({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation();
  const offcuts = useStore((s) => s.offcuts);
  const materials = useStore((s) => s.materials);
  const places = usePlaces();
  const { updateOffcuts, removeOffcut, setView } = useStore.getState();

  const [query, setQuery] = useState('');

  const [scanning, setScanning] = useState(false);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [minL, setMinL] = useState<number | null>(null);
  const [minW, setMinW] = useState<number | null>(null);
  const [showUsed, setShowUsed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // On a phone the table is a list of cards.
  const phone = useMediaQuery('(max-width: 767px)');
  const [openId, setOpenId] = useState<string | null>(null);

  const matName = (id: string | null) =>
    materials.find((m) => m.id === id)?.name ?? t('No material');
  const matColor = (id: string | null) => materials.find((m) => m.id === id)?.color ?? '#CDBEA6';

  const available = offcuts.filter((o) => o.status === 'available');
  const area = available.reduce((a, o) => a + o.length * o.width, 0);
  const materialCount = new Set(available.map((o) => o.materialId)).size;
  const queued = offcuts.filter((o) => o.label === 'queued' && o.status !== 'used');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const need = [minL ?? 0, minW ?? 0].sort((a, b) => b - a) as [number, number];
    return [...offcuts]
      .filter((o) => showUsed || o.status !== 'used')
      .filter((o) => !materialId || o.materialId === materialId)
      .filter((o) => o.length >= need[0] && o.width >= need[1])
      .filter(
        (o) =>
          !q ||
          o.code.toLowerCase().includes(q) ||
          o.location.toLowerCase().includes(q) ||
          (materials.find((m) => m.id === o.materialId)?.name ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [offcuts, query, materialId, minL, minW, showUsed, materials]);

  // A scanned label (a hardware scanner types the code and Enter) jumps straight to the offcut.
  const exact = shown.find((o) => o.code.toLowerCase() === query.trim().toLowerCase());

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        {onMenu && (
          <button
            type="button"
            className={ui.iconButton}
            aria-label={t('Projects')}
            onClick={onMenu}
          >
            <MenuIcon size={22} />
          </button>
        )}
        <div className={styles.titleBlock}>
          <div className={ui.titleRow}>
            <h1 className={styles.title}>{t('Offcut library')}</h1>
            <BackButton />
          </div>
          <span className={styles.meta}>
            {t('n_available', { count: available.length })} · {formatArea(area)} ·{' '}
            {t('n_materials', { count: materialCount })}
          </span>
        </div>
        <AddOffcut />
        <button
          type="button"
          className={ui.buttonPrimary}
          disabled={queued.length === 0}
          onClick={() => setView('labels')}
        >
          {t('print_n_labels', { count: queued.length })}
        </button>
      </div>

      {queued.length > 0 && (
        <div className={styles.banner} role="status">
          <strong>{t('n_offcuts_waiting', { count: queued.length })}</strong>{' '}
          {t('They print together on the next A4 sticker sheet.')}
        </div>
      )}

      <div className={styles.filters}>
        <label className={styles.search}>
          <SearchIcon size={16} />
          <input
            type="search"
            placeholder={t('Search ID, material or place, or scan a label')}
            aria-label={t('Search offcuts')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {canScan() && (
            <button
              type="button"
              className={styles.scanButton}
              aria-label={t('Scan a label')}
              title={t('Scan a label')}
              onClick={() => setScanning(true)}
            >
              <ScanIcon size={18} />
            </button>
          )}
        </label>
        {scanning &&
          createPortal(
            <ScanDialog
              onClose={() => setScanning(false)}
              onResult={(text) => {
                setScanning(false);
                setQuery(text);
              }}
            />,
            document.body,
          )}
        <select
          className={ui.fieldInput}
          aria-label={t('Material')}
          value={materialId ?? ''}
          onChange={(e) => setMaterialId(e.target.value || null)}
        >
          <option value="">{t('All materials')}</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span className={styles.fits}>
          {t('Fits')}
          <LengthInput
            className={`${ui.fieldInput} ${styles.fitInput}`}
            aria-label={t('Must fit length')}
            placeholder={t('L')}
            value={minL}
            onCommit={setMinL}
          />
          ×
          <LengthInput
            className={`${ui.fieldInput} ${styles.fitInput}`}
            aria-label={t('Must fit width')}
            placeholder={t('W')}
            value={minW}
            onCommit={setMinW}
          />
        </span>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={showUsed}
            onChange={(e) => setShowUsed(e.target.checked)}
          />
          {t('Show used')}
        </label>
        {selected.size > 0 && (
          <button
            type="button"
            className={ui.button}
            onClick={() => {
              updateOffcuts([...selected], { label: 'queued' });
              setSelected(new Set());
            }}
          >
            {t('queue_n_labels', { count: selected.size })}
          </button>
        )}
      </div>

      <section
        className={editor.card}
        aria-label={t('Offcuts')}
        data-cards={phone ? '' : undefined}
      >
        {phone ? (
          shown.length === 0 ? (
            <p className={styles.empty}>
              {offcuts.length === 0
                ? t(
                    'No offcuts yet. Keep leftovers when you finish a sheet in cut mode, or add one by hand.',
                  )
                : t('No offcuts match these filters.')}
            </p>
          ) : (
            <div className={cardStyles.list}>
              {shown.map((o) => (
                <OffcutCard
                  key={o.id}
                  offcut={o}
                  material={matName(o.materialId)}
                  places={places}
                  open={openId === o.id}
                  setOpen={(open) => setOpenId(open ? o.id : null)}
                  selected={selected.has(o.id)}
                  onSelect={() => toggle(o.id)}
                  hit={o === exact}
                />
              ))}
            </div>
          )
        ) : (
          <div className={editor.tableWrap}>
            <table className={`${editor.table} ${styles.table}`}>
              <thead>
                <tr>
                  <th className={styles.colSelect}>
                    <span className="sr-only">{t('Select')}</span>
                  </th>
                  <th className={styles.colShape}>
                    <span className="sr-only">{t('Shape')}</span>
                  </th>
                  <th>{t('ID')}</th>
                  <th>{t('Size ({{unit}})', { unit: unitLabel() })}</th>
                  <th>{t('Material')}</th>
                  <th>{t('Place')}</th>
                  <th>{t('Added')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Label')}</th>
                  <th className={editor.colMore}>
                    <span className="sr-only">{t('More')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={10} className={styles.empty}>
                      {offcuts.length === 0
                        ? t(
                            'No offcuts yet. Keep leftovers when you finish a sheet in cut mode, or add one by hand.',
                          )
                        : t('No offcuts match these filters.')}
                    </td>
                  </tr>
                )}
                {shown.map((o) => (
                  <tr
                    key={o.id}
                    className={
                      o.status === 'used' ? styles.usedRow : o === exact ? styles.hitRow : undefined
                    }
                  >
                    <td className={styles.colSelect}>
                      <input
                        type="checkbox"
                        aria-label={t('Select {{code}}', { code: o.code })}
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                    </td>
                    <td className={styles.colShape}>
                      <Shape offcut={o} color={matColor(o.materialId)} />
                    </td>
                    <td className={styles.code}>{o.code}</td>
                    <td className={styles.size}>
                      {formatLength(o.length)} × {formatLength(o.width)}
                    </td>
                    <td>
                      <span className={styles.material}>{matName(o.materialId)}</span>
                      <span className={styles.source}>
                        {o.usedInProjectName
                          ? t('Used in {{name}}', { name: o.usedInProjectName })
                          : o.sourceProjectName
                            ? t('From {{name}}', { name: o.sourceProjectName })
                            : t('Added by hand')}
                      </span>
                    </td>
                    <td>
                      <ComboInput
                        className={`${editor.cell} ${editor.cellText} ${styles.place}`}
                        aria-label={t('Place of {{code}}', { code: o.code })}
                        options={places}
                        placeholder="—"
                        value={o.location}
                        onChange={(location) => updateOffcuts([o.id], { location })}
                      />
                    </td>
                    <td className={styles.added}>{dateFormat().format(o.createdAt)}</td>
                    <td>
                      <select
                        className={`${styles.status} ${styles[o.status]}`}
                        aria-label={t('Status of {{code}}', { code: o.code })}
                        value={o.status}
                        onChange={(e) => {
                          const status = e.target.value as OffcutStatus;
                          updateOffcuts(
                            [o.id],
                            status === 'used' ? { status, usedAt: Date.now() } : { status },
                          );
                        }}
                      >
                        {(['available', 'reserved', 'used'] as const).map((s) => (
                          <option key={s} value={s}>
                            {statusText(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={o.label === 'queued' ? styles.labelQueued : styles.labelDone}>
                      {o.label === 'queued'
                        ? t('In print queue')
                        : o.label === 'printed'
                          ? t('Printed')
                          : t('None')}
                    </td>
                    <td className={editor.colMore}>
                      <Menu
                        label={<MoreIcon />}
                        ariaLabel={t('More actions for {{name}}', { name: o.code })}
                        triggerClassName={ui.iconButton}
                        items={[
                          ...(o.label !== 'queued'
                            ? [
                                {
                                  label: t('Print label again'),
                                  onSelect: () => updateOffcuts([o.id], { label: 'queued' }),
                                },
                              ]
                            : [
                                {
                                  label: t('Remove from print queue'),
                                  onSelect: () => updateOffcuts([o.id], { label: 'none' }),
                                },
                              ]),
                          {
                            label: t('Delete'),
                            danger: true,
                            onSelect: async () => {
                              const ok = await confirmDialog({
                                title: t('Delete offcut?'),
                                message: t('Delete {{code}}? Its label will no longer find it.', {
                                  code: o.code,
                                }),
                                confirmLabel: t('Delete'),
                                danger: true,
                              });
                              if (ok) removeOffcut(o.id);
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** One offcut as a card on a phone. */
function OffcutCard({
  offcut: o,
  material,
  places,
  open,
  setOpen,
  selected,
  onSelect,
  hit,
}: {
  offcut: Offcut;
  material: string;
  places: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
  selected: boolean;
  onSelect: () => void;
  hit: boolean;
}) {
  const { t } = useTranslation();
  const { updateOffcuts, removeOffcut } = useStore.getState();
  const size = `${formatLength(o.length)} × ${formatLength(o.width)}`;
  const labelText =
    o.label === 'queued' ? t('In print queue') : o.label === 'printed' ? t('Printed') : t('None');
  const source = o.usedInProjectName
    ? t('Used in {{name}}', { name: o.usedInProjectName })
    : o.sourceProjectName
      ? t('From {{name}}', { name: o.sourceProjectName })
      : t('Added by hand');
  return (
    <RowCard
      open={open}
      onToggle={() => setOpen(!open)}
      label={`${o.code}, ${size}, ${material}, ${o.location || '—'}, ${labelText}`}
      muted={o.status === 'used'}
      highlight={hit}
      lead={
        <input
          type="checkbox"
          aria-label={t('Select {{code}}', { code: o.code })}
          checked={selected}
          onChange={onSelect}
        />
      }
      title={size}
      lines={[`${o.code} · ${material}`, `${o.location || '—'} · ${source}`]}
      trail={
        <span className={`${styles.cardStatus} ${styles[o.status]}`}>{statusText(o.status)}</span>
      }
    >
      <CardField label={t('Place')}>
        <ComboInput
          aria-label={t('Place of {{code}}', { code: o.code })}
          options={places}
          placeholder="—"
          value={o.location}
          onChange={(location) => updateOffcuts([o.id], { location })}
        />
      </CardField>
      <CardField label={t('Status')}>
        <select
          aria-label={t('Status of {{code}}', { code: o.code })}
          value={o.status}
          onChange={(e) => {
            const status = e.target.value as OffcutStatus;
            updateOffcuts([o.id], status === 'used' ? { status, usedAt: Date.now() } : { status });
          }}
        >
          {(['available', 'reserved', 'used'] as const).map((st) => (
            <option key={st} value={st}>
              {statusText(st)}
            </option>
          ))}
        </select>
      </CardField>
      <p className={cardStyles.hint}>
        {t('Label')}: {labelText} · {t('Added')} {dateFormat().format(o.createdAt)}
      </p>
      <CardActions>
        <button
          type="button"
          onClick={() => updateOffcuts([o.id], { label: o.label === 'queued' ? 'none' : 'queued' })}
        >
          {o.label === 'queued' ? t('Remove from print queue') : t('Print label again')}
        </button>
        <button
          type="button"
          data-danger=""
          onClick={async () => {
            const ok = await confirmDialog({
              title: t('Delete offcut?'),
              message: t('Delete {{code}}? Its label will no longer find it.', { code: o.code }),
              confirmLabel: t('Delete'),
              danger: true,
            });
            if (ok) removeOffcut(o.id);
          }}
        >
          {t('Delete')}
        </button>
      </CardActions>
    </RowCard>
  );
}

function Shape({ offcut, color }: { offcut: Offcut; color: string }) {
  const s = Math.min(48 / offcut.length, 28 / offcut.width);
  const w = Math.max(4, offcut.length * s);
  const h = Math.max(3, offcut.width * s);
  return (
    <svg width="52" height="32" aria-hidden="true">
      <rect
        x={(52 - w) / 2}
        y={(32 - h) / 2}
        width={w}
        height={h}
        fill={color}
        stroke="var(--text-3)"
        strokeWidth="1"
      />
    </svg>
  );
}

/** "Add offcut" form for leftovers that didn't come from a cut in this app. */
function AddOffcut() {
  const places = usePlaces();
  const { t } = useTranslation();
  const [length, setLength] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [grain, setGrain] = useState<Grain>('length');
  const ok = !!length && !!width && length > 0 && width > 0;
  return (
    <Popover
      triggerClassName={ui.button}
      align="end"
      label={
        <>
          <PlusIcon size={16} />
          {t('Add offcut')}
        </>
      }
    >
      {(close) => (
        <form
          className={styles.addForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return;
            useStore
              .getState()
              .addOffcuts([{ length: length!, width: width!, materialId, location, grain }]);
            setLength(null);
            setWidth(null);
            close();
          }}
        >
          <span className={styles.addTitle}>{t('Add an offcut by hand')}</span>
          <div className={styles.addSize}>
            <LengthInput
              className={ui.fieldInput}
              aria-label={t('Length')}
              placeholder={t('Length')}
              value={length}
              onCommit={setLength}
            />
            ×
            <LengthInput
              className={ui.fieldInput}
              aria-label={t('Width')}
              placeholder={t('Width')}
              value={width}
              onCommit={setWidth}
            />
            {unitLabel()}
          </div>
          <MaterialSelect
            value={materialId}
            anyLabel={t('No material')}
            ariaLabel={t('Material')}
            onChange={setMaterialId}
          />
          <select
            className={ui.fieldInput}
            aria-label={t('Grain')}
            value={grain}
            onChange={(e) => setGrain(e.target.value as Grain)}
          >
            <option value="length">{t('Grain along the length')}</option>
            <option value="width">{t('Grain along the width')}</option>
            <option value="none">{t('No grain')}</option>
          </select>
          <ComboInput
            className={ui.fieldInput}
            aria-label={t('Place')}
            placeholder={t('Place, e.g. Rack A')}
            options={places}
            value={location}
            onChange={setLocation}
          />
          <button type="submit" className={ui.buttonPrimary} disabled={!ok}>
            {t('Add and queue its label')}
          </button>
        </form>
      )}
    </Popover>
  );
}
