// Materials & prices: the board and edge-band library shared by every project.
import {
  addEdgeBand,
  addMaterial,
  removeEdgeBand,
  removeMaterial,
  updateEdgeBand,
  updateMaterial,
  useStore,
} from '../store/store';
import type { Grain } from '../engine/types';
import { materialGrain } from '../model/library';
import { MenuIcon, MoreIcon } from '../ui/icons';
import { BackButton } from '../ui/BackButton';
import {
  areaPriceIn,
  areaPriceOut,
  areaUnit,
  formatLengthUnit,
  isImperial,
  longPriceIn,
  longPriceOut,
  unitLabel,
} from '../lib/units';
import { LengthInput, NumberInput } from '../ui/NumberInput';

/** Prices converted to feet carry long fractions: compare and show them rounded. */
const exact = (v: number) => Math.round(v * 1e6) / 1e6;
const formatPrice = (v: number) => String(Math.round(v * 1e4) / 1e4);
import { confirmDialog } from '../ui/dialogs';
import { Menu } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import editor from '../editor/Editor.module.css';
import styles from './Library.module.css';
import { useTranslation } from 'react-i18next';

export function LibraryScreen({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const bands = useStore((s) => s.edgeBands);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);

  const usage = (id: string) =>
    projects.filter(
      (p) => p.stock.some((s) => s.materialId === id) || p.parts.some((x) => x.materialId === id),
    ).length;

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
        <div className={ui.titleRow}>
          <h1 className={styles.title}>{t('Materials & prices')}</h1>
          <BackButton />
        </div>
      </div>

      <section className={editor.card} aria-labelledby="materials-h">
        <div className={editor.cardHeader}>
          <h2 id="materials-h">{t('Boards')}</h2>
          <span className={editor.cardMeta}>
            {t(
              'A per-sheet price is for the size shown; other sizes (and offcuts) are priced by area.',
            )}
          </span>
          <span className={editor.spacer} />
          <button
            type="button"
            className={ui.buttonPrimary}
            onClick={() => {
              const m = addMaterial(t('New board'), { length: 2800, width: 2070 });
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>(`[data-material="${m.id}"]`)?.select(),
              );
            }}
          >
            {t('Add board')}
          </button>
        </div>
        <div className={editor.tableWrap}>
          <table className={`${editor.table} ${styles.table}`}>
            <thead>
              <tr>
                <th className={styles.colColor}>
                  <span className="sr-only">{t('Colour')}</span>
                </th>
                <th>{t('Name')}</th>
                <th className={editor.num}>{t('Thickness')}</th>
                <th>{t('Grain')}</th>
                <th className={editor.num}>{t('Price')}</th>
                <th>{t('Per')}</th>
                <th>{t('For sheet size')}</th>
                <th className={editor.colMore}>
                  <span className="sr-only">{t('More')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {materials.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    {t('No boards yet. Add the sheet materials you buy, with their prices.')}
                  </td>
                </tr>
              )}
              {materials.map((m) => {
                const used = usage(m.id);
                return (
                  <tr key={m.id}>
                    <td className={styles.colColor}>
                      <input
                        type="color"
                        className={styles.color}
                        aria-label={t('Colour of {{name}}', { name: m.name })}
                        value={m.color}
                        onChange={(e) => updateMaterial(m.id, { color: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className={`${editor.cell} ${editor.cellText}`}
                        aria-label={t('Board name')}
                        data-material={m.id}
                        value={m.name}
                        onChange={(e) => updateMaterial(m.id, { name: e.target.value })}
                      />
                      {used > 0 && (
                        <span className={styles.usage}>{t('in_n_projects', { count: used })}</span>
                      )}
                    </td>
                    <td className={styles.colNum}>
                      <span className={styles.withUnit}>
                        <LengthInput
                          className={editor.cell}
                          aria-label={t('Thickness of {{name}}', { name: m.name })}
                          value={m.thickness}
                          onCommit={(thickness) => updateMaterial(m.id, { thickness })}
                        />
                        {unitLabel()}
                      </span>
                    </td>
                    <td>
                      <select
                        className={editor.select}
                        aria-label={t('Grain of {{name}}', { name: m.name })}
                        value={materialGrain(m)}
                        onChange={(e) => updateMaterial(m.id, { grain: e.target.value as Grain })}
                      >
                        <option value="length">{t('Along the length')}</option>
                        <option value="width">{t('Along the width')}</option>
                        <option value="none">{t('No grain')}</option>
                      </select>
                    </td>
                    <td className={styles.colNum}>
                      <NumberInput
                        className={editor.cell}
                        aria-label={t('Price of {{name}}', { name: m.name })}
                        aria-invalid={m.price === null || undefined}
                        placeholder="—"
                        format={formatPrice}
                        value={
                          m.priceUnit === 'sqm' && m.price !== null
                            ? exact(areaPriceOut(m.price))
                            : m.price
                        }
                        onCommit={(price) =>
                          updateMaterial(m.id, {
                            price:
                              m.priceUnit === 'sqm' && price !== null ? areaPriceIn(price) : price,
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className={editor.select}
                        aria-label={t('Price unit of {{name}}', { name: m.name })}
                        value={m.priceUnit}
                        onChange={(e) =>
                          updateMaterial(m.id, { priceUnit: e.target.value as 'sheet' | 'sqm' })
                        }
                      >
                        <option value="sheet">{t('sheet')}</option>
                        <option value="sqm">{areaUnit()}</option>
                      </select>
                    </td>
                    <td>
                      {m.priceUnit === 'sheet' ? (
                        <span className={styles.size}>
                          <LengthInput
                            className={editor.cell}
                            aria-label={t('Sheet length for the price of {{name}}', {
                              name: m.name,
                            })}
                            placeholder={t('Length')}
                            value={m.sheetLength}
                            onCommit={(sheetLength) => updateMaterial(m.id, { sheetLength })}
                          />
                          ×
                          <LengthInput
                            className={editor.cell}
                            aria-label={t('Sheet width for the price of {{name}}', {
                              name: m.name,
                            })}
                            placeholder={t('Width')}
                            value={m.sheetWidth}
                            onCommit={(sheetWidth) => updateMaterial(m.id, { sheetWidth })}
                          />
                        </span>
                      ) : (
                        <span className={styles.muted}>{t('any size')}</span>
                      )}
                    </td>
                    <td className={editor.colMore}>
                      <Menu
                        label={<MoreIcon />}
                        ariaLabel={t('More actions for {{name}}', { name: m.name })}
                        triggerClassName={ui.iconButton}
                        items={[
                          {
                            label: t('Delete'),
                            danger: true,
                            onSelect: async () => {
                              const ok =
                                used === 0 ||
                                (await confirmDialog({
                                  title: t('Delete material?'),
                                  message: t('delete_material_in_use', {
                                    name: m.name,
                                    count: used,
                                  }),
                                  confirmLabel: t('Delete'),
                                  danger: true,
                                }));
                              if (ok) removeMaterial(m.id);
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={editor.card} aria-labelledby="bands-h">
        <div className={editor.cardHeader}>
          <h2 id="bands-h">{t('Edge bands')}</h2>
          <span className={editor.cardMeta}>
            {isImperial()
              ? t('Priced per foot, plus {{length}} per banded edge', {
                  length: formatLengthUnit(settings.edgeAllowance),
                })
              : t('Priced per metre, plus {{length}} per banded edge', {
                  length: formatLengthUnit(settings.edgeAllowance),
                })}
          </span>
          <span className={editor.spacer} />
          <button
            type="button"
            className={ui.button}
            onClick={() => {
              const b = addEdgeBand();
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>(`[data-band="${b.id}"]`)?.select(),
              );
            }}
          >
            {t('Add edge band')}
          </button>
        </div>
        <div className={editor.tableWrap}>
          <table className={`${editor.table} ${styles.table}`}>
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th className={editor.num}>
                  {isImperial() ? t('Price per foot') : t('Price per metre')}
                </th>
                <th className={editor.colMore}>
                  <span className="sr-only">{t('More')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bands.length === 0 && (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    {t('No edge bands yet.')}
                  </td>
                </tr>
              )}
              {bands.map((b) => (
                <tr key={b.id}>
                  <td>
                    <input
                      className={`${editor.cell} ${editor.cellText}`}
                      aria-label={t('Edge band name')}
                      data-band={b.id}
                      value={b.name}
                      onChange={(e) => updateEdgeBand(b.id, { name: e.target.value })}
                    />
                  </td>
                  <td className={styles.colNum}>
                    <NumberInput
                      className={editor.cell}
                      aria-label={
                        isImperial()
                          ? t('Price per foot of {{name}}', { name: b.name })
                          : t('Price per metre of {{name}}', { name: b.name })
                      }
                      aria-invalid={b.pricePerMetre === null || undefined}
                      placeholder="—"
                      format={formatPrice}
                      value={b.pricePerMetre === null ? null : exact(longPriceOut(b.pricePerMetre))}
                      onCommit={(v) =>
                        updateEdgeBand(b.id, { pricePerMetre: v === null ? null : longPriceIn(v) })
                      }
                    />
                  </td>
                  <td className={editor.colMore}>
                    <Menu
                      label={<MoreIcon />}
                      ariaLabel={t('More actions for {{name}}', { name: b.name })}
                      triggerClassName={ui.iconButton}
                      items={[
                        { label: t('Delete'), danger: true, onSelect: () => removeEdgeBand(b.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
