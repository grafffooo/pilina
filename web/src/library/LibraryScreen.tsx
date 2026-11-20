// Materials & prices: the board and edge-band library shared by every project.
import {
  addEdgeBand,
  addLinearMaterial,
  addMaterial,
  removeEdgeBand,
  updateEdgeBand,
  updateMaterial,
  useStore,
} from '../store/store';
import type { Grain } from '../engine/types';
import { materialGrain, materialKind } from '../model/library';
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
  longUnit,
  unitLabel,
} from '../lib/units';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { exact, formatPrice } from './priceFormat';
import {
  BandCards,
  BoardCards,
  LinearMaterialCards,
  confirmDeleteMaterial,
} from './LibraryCards';
import { useMediaQuery } from '../ui/hooks';

import { Menu } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import editor from '../editor/Editor.module.css';
import styles from './Library.module.css';
import { SortTh, useTableSort } from '../ui/tableSort';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function LibraryScreen({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const bands = useStore((s) => s.edgeBands);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);
  // On a phone the tables are cards; a new board or band opens its card.
  const phone = useMediaQuery('(max-width: 767px)');
  const sheetMaterials = materials.filter((m) => materialKind(m) === 'sheet');
  const linearMaterials = materials.filter((m) => materialKind(m) === 'linear');
  const matSort = useTableSort<'name' | 'thickness' | 'grain' | 'price' | 'per' | 'size'>();
  const sortedMaterials = matSort.sortRows(sheetMaterials, (m, key) => {
    switch (key) {
      case 'name':
        return m.name;
      case 'thickness':
        return m.thickness;
      case 'grain':
        return materialGrain(m);
      case 'price':
        return m.price;
      case 'per':
        return m.priceUnit;
      case 'size':
        return m.sheetLength != null && m.sheetWidth != null ? m.sheetLength * m.sheetWidth : null;
    }
  });
  const linearSort = useTableSort<'name' | 'profile' | 'price' | 'per' | 'length'>();
  const sortedLinear = linearSort.sortRows(linearMaterials, (m, key) => {
    switch (key) {
      case 'name':
        return m.name;
      case 'profile':
        return m.thickness != null ? m.thickness * (m.profileWidth ?? 1) : null;
      case 'price':
        return m.price;
      case 'per':
        return m.priceUnit;
      case 'length':
        return m.stockLength ?? null;
    }
  });
  const bandSort = useTableSort<'name' | 'price'>();
  const sortedBands = bandSort.sortRows(bands, (b, key) =>
    key === 'name' ? b.name : b.pricePerMetre,
  );
  const [boardOpen, setBoardOpen] = useState<string | null>(null);
  const [linearOpen, setLinearOpen] = useState<string | null>(null);
  const [bandOpen, setBandOpen] = useState<string | null>(null);

  const usage = (id: string) =>
    projects.filter(
      (p) =>
        p.stock.some((s) => s.materialId === id) ||
        p.parts.some((x) => x.materialId === id) ||
        (p.linearStock ?? []).some((s) => s.materialId === id) ||
        (p.linearParts ?? []).some((x) => x.materialId === id),
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

      <section
        className={editor.card}
        aria-labelledby="materials-h"
        data-cards={phone ? '' : undefined}
      >
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
              if (phone) {
                useStore.getState().setView('add-board');
                return;
              }
              const m = addMaterial(t('New board'), { length: 2800, width: 2070 });
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>(`[data-material="${m.id}"]`)?.select(),
              );
            }}
          >
            {t('Add board')}
          </button>
        </div>
        {phone ? (
          <BoardCards
            materials={sheetMaterials}
            usage={usage}
            openId={boardOpen}
            setOpenId={setBoardOpen}
          />
        ) : (
          <div className={editor.tableWrap}>
            <table className={`${editor.table} ${styles.table}`}>
              <thead>
                <tr>
                  <th className={styles.colColor}>
                    <span className="sr-only">{t('Colour')}</span>
                  </th>
                  <SortTh col="name" sortKey={matSort.sortKey} sortDir={matSort.sortDir} onSort={matSort.toggle}>
                    {t('Name')}
                  </SortTh>
                  <SortTh col="thickness" sortKey={matSort.sortKey} sortDir={matSort.sortDir} onSort={matSort.toggle} className={editor.num} numeric>
                    {t('Thickness')}
                  </SortTh>
                  <SortTh col="grain" sortKey={matSort.sortKey} sortDir={matSort.sortDir} onSort={matSort.toggle}>
                    {t('Grain')}
                  </SortTh>
                  <SortTh col="price" sortKey={matSort.sortKey} sortDir={matSort.sortDir} onSort={matSort.toggle} className={editor.num} numeric>
                    {t('Price')}
                  </SortTh>
                  <SortTh col="per" sortKey={matSort.sortKey} sortDir={matSort.sortDir} onSort={matSort.toggle}>
                    {t('Per')}
                  </SortTh>
                  <SortTh col="size" sortKey={matSort.sortKey} sortDir={matSort.sortDir} onSort={matSort.toggle}>
                    {t('For sheet size')}
                  </SortTh>
                  <th className={editor.colMore}>
                    <span className="sr-only">{t('More')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheetMaterials.length === 0 && (
                  <tr>
                    <td colSpan={8} className={styles.empty}>
                      {t('No boards yet. Add the sheet materials you buy, with their prices.')}
                    </td>
                  </tr>
                )}
                {sortedMaterials.map((m) => {
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
                          <span className={styles.usage}>
                            {t('in_n_projects', { count: used })}
                          </span>
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
                                m.priceUnit === 'sqm' && price !== null
                                  ? areaPriceIn(price)
                                  : price,
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
                              onSelect: () => void confirmDeleteMaterial(m, used, t),
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
        )}
      </section>

      <section
        className={editor.card}
        aria-labelledby="linear-materials-h"
        data-cards={phone ? '' : undefined}
      >
        <div className={editor.cardHeader}>
          <h2 id="linear-materials-h">{t('Linear stock')}</h2>
          <span className={editor.cardMeta}>
            {t(
              'A per-piece price is for the bar length shown; other lengths (and offcuts) are priced by length.',
            )}
          </span>
          <span className={editor.spacer} />
          <button
            type="button"
            className={ui.button}
            onClick={() => {
              if (phone) {
                useStore.getState().setView('add-linear-material');
                return;
              }
              const m = addLinearMaterial(t('New linear stock'), { stockLength: 3000 });
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>(`[data-material="${m.id}"]`)?.select(),
              );
            }}
          >
            {t('Add linear stock')}
          </button>
        </div>
        {phone ? (
          <LinearMaterialCards
            materials={linearMaterials}
            usage={usage}
            openId={linearOpen}
            setOpenId={setLinearOpen}
          />
        ) : (
          <div className={editor.tableWrap}>
            <table className={`${editor.table} ${styles.table}`}>
              <thead>
                <tr>
                  <th className={styles.colColor}>
                    <span className="sr-only">{t('Colour')}</span>
                  </th>
                  <SortTh col="name" sortKey={linearSort.sortKey} sortDir={linearSort.sortDir} onSort={linearSort.toggle}>
                    {t('Name')}
                  </SortTh>
                  <SortTh col="profile" sortKey={linearSort.sortKey} sortDir={linearSort.sortDir} onSort={linearSort.toggle}>
                    {t('Profile')}
                  </SortTh>
                  <SortTh col="price" sortKey={linearSort.sortKey} sortDir={linearSort.sortDir} onSort={linearSort.toggle} className={editor.num} numeric>
                    {t('Price')}
                  </SortTh>
                  <SortTh col="per" sortKey={linearSort.sortKey} sortDir={linearSort.sortDir} onSort={linearSort.toggle}>
                    {t('Per')}
                  </SortTh>
                  <SortTh col="length" sortKey={linearSort.sortKey} sortDir={linearSort.sortDir} onSort={linearSort.toggle}>
                    {t('For bar length')}
                  </SortTh>
                  <th className={editor.colMore}>
                    <span className="sr-only">{t('More')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linearMaterials.length === 0 && (
                  <tr>
                    <td colSpan={7} className={styles.empty}>
                      {t('No linear stock yet. Add timber, battens or profiles you buy, with their prices.')}
                    </td>
                  </tr>
                )}
                {sortedLinear.map((m) => {
                  const used = usage(m.id);
                  const perMetre = m.priceUnit === 'metre';
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
                          aria-label={t('Linear stock name')}
                          data-material={m.id}
                          value={m.name}
                          onChange={(e) => updateMaterial(m.id, { name: e.target.value })}
                        />
                        {used > 0 && (
                          <span className={styles.usage}>
                            {t('in_n_projects', { count: used })}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={styles.size}>
                          <LengthInput
                            className={editor.cell}
                            aria-label={t('Thickness of {{name}}', { name: m.name })}
                            placeholder={t('Thickness')}
                            value={m.thickness}
                            onCommit={(thickness) => updateMaterial(m.id, { thickness })}
                          />
                          ×
                          <LengthInput
                            className={editor.cell}
                            aria-label={t('Profile width of {{name}}', { name: m.name })}
                            placeholder={t('Width')}
                            value={m.profileWidth ?? null}
                            onCommit={(profileWidth) => updateMaterial(m.id, { profileWidth })}
                          />
                          {unitLabel()}
                        </span>
                      </td>
                      <td className={styles.colNum}>
                        <NumberInput
                          className={editor.cell}
                          aria-label={t('Price of {{name}}', { name: m.name })}
                          aria-invalid={m.price === null || undefined}
                          placeholder="—"
                          format={formatPrice}
                          value={
                            perMetre && m.price !== null
                              ? exact(longPriceOut(m.price))
                              : m.price
                          }
                          onCommit={(price) =>
                            updateMaterial(m.id, {
                              price:
                                perMetre && price !== null
                                  ? longPriceIn(price)
                                  : price,
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className={editor.select}
                          aria-label={t('Price unit of {{name}}', { name: m.name })}
                          value={perMetre ? 'metre' : 'piece'}
                          onChange={(e) =>
                            updateMaterial(m.id, { priceUnit: e.target.value as 'piece' | 'metre' })
                          }
                        >
                          <option value="piece">{t('piece')}</option>
                          <option value="metre">{longUnit()}</option>
                        </select>
                      </td>
                      <td>
                        {!perMetre ? (
                          <span className={styles.withUnit}>
                            <LengthInput
                              className={editor.cell}
                              aria-label={t('Bar length for the price of {{name}}', {
                                name: m.name,
                              })}
                              placeholder={t('Length')}
                              value={m.stockLength ?? null}
                              onCommit={(stockLength) => updateMaterial(m.id, { stockLength })}
                            />
                            {unitLabel()}
                          </span>
                        ) : (
                          <span className={styles.muted}>{t('any length')}</span>
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
                              onSelect: () => void confirmDeleteMaterial(m, used, t),
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
        )}
      </section>

      <section
        className={editor.card}
        aria-labelledby="bands-h"
        data-cards={phone ? '' : undefined}
      >
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
              if (phone) {
                useStore.getState().setView('add-band');
                return;
              }
              const b = addEdgeBand();
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>(`[data-band="${b.id}"]`)?.select(),
              );
            }}
          >
            {t('Add edge band')}
          </button>
        </div>
        {phone ? (
          <BandCards bands={bands} openId={bandOpen} setOpenId={setBandOpen} />
        ) : (
          <div className={editor.tableWrap}>
            <table className={`${editor.table} ${styles.table}`}>
              <thead>
                <tr>
                  <SortTh col="name" sortKey={bandSort.sortKey} sortDir={bandSort.sortDir} onSort={bandSort.toggle}>
                    {t('Name')}
                  </SortTh>
                  <SortTh col="price" sortKey={bandSort.sortKey} sortDir={bandSort.sortDir} onSort={bandSort.toggle} className={editor.num} numeric>
                    {isImperial() ? t('Price per foot') : t('Price per metre')}
                  </SortTh>
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
                {sortedBands.map((b) => (
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
                        value={
                          b.pricePerMetre === null ? null : exact(longPriceOut(b.pricePerMetre))
                        }
                        onCommit={(v) =>
                          updateEdgeBand(b.id, {
                            pricePerMetre: v === null ? null : longPriceIn(v),
                          })
                        }
                      />
                    </td>
                    <td className={editor.colMore}>
                      <Menu
                        label={<MoreIcon />}
                        ariaLabel={t('More actions for {{name}}', { name: b.name })}
                        triggerClassName={ui.iconButton}
                        items={[
                          {
                            label: t('Delete'),
                            danger: true,
                            onSelect: () => removeEdgeBand(b.id),
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
