import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Grain } from '../engine/types';
import { formatPrice } from '../library/priceFormat';
import { areaPriceIn, areaUnit, longPriceIn, longUnit, unitLabel } from '../lib/units';
import type { MaterialKind } from '../model/library';
import { addLinearMaterial, addMaterial, updateMaterial, useStore } from '../store/store';
import { CloseIcon } from '../ui/icons';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { SegmentedControl } from '../ui/SegmentedControl';
import ui from '../ui/ui.module.css';
import styles from './NewMaterialModal.module.css';

const PRESET_COLORS = [
  '#C8A27A',
  '#E9E4DA',
  '#8A6A4F',
  '#2B2B2B',
  '#B7C4CF',
  '#6E7F5E',
  '#D9CBB2',
];

export function NewMaterialModal({
  kind = 'sheet',
  sheet,
  stockLength,
  onCreated,
  onClose,
}: {
  kind?: MaterialKind;
  sheet?: { length: number; width: number };
  stockLength?: number;
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const count = useStore((s) => s.materials.length);
  const [name, setName] = useState('');
  const [thickness, setThickness] = useState<number | null>(kind === 'sheet' ? 18 : null);
  const [profileWidth, setProfileWidth] = useState<number | null>(null);
  const [grain, setGrain] = useState<Grain>('length');
  const [sheetLength, setSheetLength] = useState<number | null>(sheet?.length ?? 2800);
  const [sheetWidth, setSheetWidth] = useState<number | null>(sheet?.width ?? 2070);
  const [barLength, setBarLength] = useState<number | null>(stockLength ?? 3000);
  const [price, setPrice] = useState<number | null>(null);
  const [sheetUnit, setSheetUnit] = useState<'sheet' | 'sqm'>('sheet');
  const [linearUnit, setLinearUnit] = useState<'piece' | 'metre'>('piece');
  const [color, setColor] = useState(() => PRESET_COLORS[count % PRESET_COLORS.length]!);

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const valid =
    name.trim() !== '' &&
    (kind === 'sheet'
      ? (sheetLength ?? 0) > 0 && (sheetWidth ?? 0) > 0
      : (barLength ?? 0) > 0);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (kind === 'linear') {
      const m = addLinearMaterial(name.trim(), {
        thickness: thickness ?? undefined,
        profileWidth: profileWidth ?? undefined,
        stockLength: barLength,
      });
      updateMaterial(m.id, {
        color,
        price: price === null ? null : linearUnit === 'metre' ? longPriceIn(price) : price,
        priceUnit: linearUnit,
      });
      onCreated(m.id);
    } else {
      const m = addMaterial(
        name.trim(),
        sheetLength && sheetWidth ? { length: sheetLength, width: sheetWidth } : undefined,
      );
      updateMaterial(m.id, {
        thickness,
        grain,
        color,
        price: price === null ? null : sheetUnit === 'sqm' ? areaPriceIn(price) : price,
        priceUnit: sheetUnit,
      });
      onCreated(m.id);
    }
    onClose();
  };

  return createPortal(
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-material-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <form onSubmit={onSubmit}>
          <div className={styles.header}>
            <h2 id="new-material-title" className={styles.title}>
              {kind === 'linear' ? t('Add linear stock') : t('New material')}
            </h2>
            <button
              type="button"
              className={ui.iconButton}
              aria-label={t('Close')}
              onClick={onClose}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>{t('Name')}</span>
            <input
              ref={nameRef}
              className={styles.input}
              aria-label={kind === 'linear' ? t('Linear stock name') : t('Board name')}
              placeholder={
                kind === 'linear'
                  ? t('Name of the new linear stock, e.g. “KVH 45x95”')
                  : t('Name of the new material, e.g. “DTD White 18mm”')
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {kind === 'sheet' ? (
            <>
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('Thickness')} ({unitLabel()})
                  </span>
                  <LengthInput
                    className={styles.input}
                    aria-label={t('Thickness')}
                    value={thickness}
                    onCommit={setThickness}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>{t('Grain')}</span>
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
              </div>

              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('For sheet size')}: {t('Length')} ({unitLabel()})
                  </span>
                  <LengthInput
                    className={styles.input}
                    aria-label={t('Length')}
                    value={sheetLength}
                    onCommit={setSheetLength}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('For sheet size')}: {t('Width')} ({unitLabel()})
                  </span>
                  <LengthInput
                    className={styles.input}
                    aria-label={t('Width')}
                    value={sheetWidth}
                    onCommit={setSheetWidth}
                  />
                </label>
              </div>

              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('Price')}</span>
                  <NumberInput
                    className={styles.input}
                    aria-label={t('Price')}
                    placeholder="—"
                    format={formatPrice}
                    value={price}
                    onCommit={setPrice}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>{t('Per')}</span>
                  <SegmentedControl
                    full
                    label={t('Per')}
                    value={sheetUnit}
                    options={[
                      { value: 'sheet', label: t('sheet') },
                      { value: 'sqm', label: areaUnit() },
                    ]}
                    onChange={setSheetUnit}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('Thickness')} ({unitLabel()})
                  </span>
                  <LengthInput
                    className={styles.input}
                    aria-label={t('Thickness')}
                    value={thickness}
                    onCommit={setThickness}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('Profile width')} ({unitLabel()})
                  </span>
                  <LengthInput
                    className={styles.input}
                    aria-label={t('Profile width')}
                    value={profileWidth}
                    onCommit={setProfileWidth}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>
                  {t('For bar length')} ({unitLabel()})
                </span>
                <LengthInput
                  className={styles.input}
                  aria-label={t('For bar length')}
                  value={barLength}
                  onCommit={setBarLength}
                />
              </label>

              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('Price')}</span>
                  <NumberInput
                    className={styles.input}
                    aria-label={t('Price')}
                    placeholder="—"
                    format={formatPrice}
                    value={price}
                    onCommit={setPrice}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>{t('Per')}</span>
                  <SegmentedControl
                    full
                    label={t('Per')}
                    value={linearUnit}
                    options={[
                      { value: 'piece', label: t('piece') },
                      { value: 'metre', label: longUnit() },
                    ]}
                    onChange={setLinearUnit}
                  />
                </div>
              </div>
            </>
          )}

          <div className={styles.field}>
            <span className={styles.label}>{t('Colour')}</span>
            <div className={styles.colorRow}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={styles.swatchBtn}
                  style={{ background: c }}
                  aria-label={c}
                  aria-pressed={color.toLowerCase() === c.toLowerCase()}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                type="color"
                className={styles.colorInput}
                aria-label={t('Colour')}
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={ui.button} onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="submit" className={ui.buttonPrimary} disabled={!valid}>
              {t('Add')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
