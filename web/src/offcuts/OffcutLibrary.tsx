// Offcut library: every kept leftover with its ID, size, material, place and label state.
import { useMemo, useState } from 'react';
import { formatSquareMetres } from '../lib/format';
import type { Offcut, OffcutStatus } from '../model/offcut';
import { useStore } from '../store/store';
import { MenuIcon, MoreIcon, PlusIcon, SearchIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import { confirmDialog } from '../ui/dialogs';
import { Menu, Popover } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import editor from '../editor/Editor.module.css';
import { MaterialSelect } from '../editor/MaterialSelect';
import { locale, t as i18nT } from '../i18n';
import styles from './Offcuts.module.css';
import { useTranslation } from 'react-i18next';

const statusText = (s: OffcutStatus) =>
  s === 'available' ? i18nT('Available') : s === 'reserved' ? i18nT('Reserved') : i18nT('Used');

const dateFormat = () => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });

export function OffcutLibrary({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation();
  const offcuts = useStore((s) => s.offcuts);
  const materials = useStore((s) => s.materials);
  const settings = useStore((s) => s.settings);
  const { updateOffcuts, removeOffcut, setView } = useStore.getState();

  const [query, setQuery] = useState('');
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [minL, setMinL] = useState<number | null>(null);
  const [minW, setMinW] = useState<number | null>(null);
  const [showUsed, setShowUsed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
          <h1 className={styles.title}>{t('Offcut library')}</h1>
          <span className={styles.meta}>
            {t('n_available', { count: available.length })} · {formatSquareMetres(area)} ·{' '}
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
        </label>
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
          <NumberInput
            className={`${ui.fieldInput} ${styles.fitInput}`}
            aria-label={t('Must fit length, mm')}
            placeholder={t('L')}
            value={minL}
            onCommit={setMinL}
          />
          ×
          <NumberInput
            className={`${ui.fieldInput} ${styles.fitInput}`}
            aria-label={t('Must fit width, mm')}
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

      <section className={editor.card} aria-label={t('Offcuts')}>
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
                <th>{t('Size (mm)')}</th>
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
                    {o.length} × {o.width}
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
                    <input
                      className={`${editor.cell} ${editor.cellText} ${styles.place}`}
                      aria-label={t('Place of {{code}}', { code: o.code })}
                      list="offcut-places"
                      placeholder="—"
                      value={o.location}
                      onChange={(e) => updateOffcuts([o.id], { location: e.target.value })}
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
      </section>
      <datalist id="offcut-places">
        {settings.locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </div>
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
  const { t } = useTranslation();
  const [length, setLength] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
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
              .addOffcuts([{ length: length!, width: width!, materialId, location }]);
            setLength(null);
            setWidth(null);
            close();
          }}
        >
          <span className={styles.addTitle}>{t('Add an offcut by hand')}</span>
          <div className={styles.addSize}>
            <NumberInput
              className={ui.fieldInput}
              aria-label={t('Length, mm')}
              placeholder={t('Length')}
              value={length}
              onCommit={setLength}
            />
            ×
            <NumberInput
              className={ui.fieldInput}
              aria-label={t('Width, mm')}
              placeholder={t('Width')}
              value={width}
              onCommit={setWidth}
            />
            mm
          </div>
          <MaterialSelect
            value={materialId}
            anyLabel={t('No material')}
            ariaLabel={t('Material')}
            onChange={setMaterialId}
          />
          <input
            className={ui.fieldInput}
            aria-label={t('Place')}
            placeholder={t('Place, e.g. Rack A')}
            list="offcut-places"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button type="submit" className={ui.buttonPrimary} disabled={!ok}>
            {t('Add and queue its label')}
          </button>
        </form>
      )}
    </Popover>
  );
}
