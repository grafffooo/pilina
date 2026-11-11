// Boards and edge bands as cards on a phone (the library's tables scroll sideways).
import type { Grain } from '../engine/types';
import { useTranslation } from 'react-i18next';
import {
  areaPriceIn,
  areaPriceOut,
  areaUnit,
  formatLength,
  isImperial,
  longPriceIn,
  longPriceOut,
  unitLabel,
} from '../lib/units';
import { formatMoney, materialGrain, type EdgeBand, type Material } from '../model/library';
import {
  removeEdgeBand,
  removeMaterial,
  updateEdgeBand,
  updateMaterial,
  useStore,
} from '../store/store';
import { confirmDialog } from '../ui/dialogs';
import { LengthInput, NumberInput } from '../ui/NumberInput';
import { CardActions, CardField, CardFields, cardStyles, RowCard } from '../ui/RowCard';
import { exact, formatPrice } from './priceFormat';
import styles from './Library.module.css';

const grainName = (g: Grain, t: (k: string) => string) =>
  g === 'length' ? t('Along the length') : g === 'width' ? t('Along the width') : t('No grain');

export function BoardCards({
  materials,
  usage,
  openId,
  setOpenId,
}: {
  materials: Material[];
  usage: (id: string) => number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const currency = useStore((s) => s.settings.currency);
  if (materials.length === 0) {
    return (
      <p className={styles.empty}>
        {t('No boards yet. Add the sheet materials you buy, with their prices.')}
      </p>
    );
  }
  return (
    <div className={cardStyles.list}>
      {materials.map((m) => {
        const used = usage(m.id);
        const open = openId === m.id;
        const shownPrice =
          m.price === null ? null : m.priceUnit === 'sqm' ? exact(areaPriceOut(m.price)) : m.price;
        return (
          <RowCard
            key={m.id}
            open={open}
            onToggle={() => setOpenId(open ? null : m.id)}
            label={m.name}
            lead={
              <span
                className={styles.cardSwatch}
                style={{ background: m.color }}
                aria-hidden="true"
              />
            }
            title={m.name}
            lines={[
              shownPrice === null
                ? '—'
                : `${formatMoney(shownPrice, currency)} / ${m.priceUnit === 'sheet' ? t('sheet') : areaUnit()}`,
              [
                m.priceUnit === 'sheet' && m.sheetLength && m.sheetWidth
                  ? `${formatLength(m.sheetLength)} × ${formatLength(m.sheetWidth)}`
                  : null,
                grainName(materialGrain(m), t),
              ]
                .filter(Boolean)
                .join(' · '),
            ]}
          >
            <CardField label={t('Name')}>
              <input
                aria-label={t('Board name')}
                data-material={m.id}
                value={m.name}
                style={{ textAlign: 'start' }}
                onChange={(e) => updateMaterial(m.id, { name: e.target.value })}
              />
            </CardField>
            <CardFields>
              <CardField label={`${t('Thickness')} (${unitLabel()})`}>
                <LengthInput
                  aria-label={t('Thickness of {{name}}', { name: m.name })}
                  value={m.thickness}
                  onCommit={(thickness) => updateMaterial(m.id, { thickness })}
                />
              </CardField>
              <CardField label={t('Price')}>
                <NumberInput
                  aria-label={t('Price of {{name}}', { name: m.name })}
                  aria-invalid={m.price === null || undefined}
                  placeholder="—"
                  format={formatPrice}
                  value={shownPrice}
                  onCommit={(price) =>
                    updateMaterial(m.id, {
                      price: m.priceUnit === 'sqm' && price !== null ? areaPriceIn(price) : price,
                    })
                  }
                />
              </CardField>
            </CardFields>
            <CardField label={t('Per')}>
              <select
                aria-label={t('Price unit of {{name}}', { name: m.name })}
                value={m.priceUnit}
                onChange={(e) =>
                  updateMaterial(m.id, { priceUnit: e.target.value as 'sheet' | 'sqm' })
                }
              >
                <option value="sheet">{t('sheet')}</option>
                <option value="sqm">{areaUnit()}</option>
              </select>
            </CardField>
            {m.priceUnit === 'sheet' && (
              <CardFields>
                <CardField label={`${t('For sheet size')}: ${t('Length')}`}>
                  <LengthInput
                    aria-label={t('Sheet length for the price of {{name}}', { name: m.name })}
                    placeholder={t('Length')}
                    value={m.sheetLength}
                    onCommit={(sheetLength) => updateMaterial(m.id, { sheetLength })}
                  />
                </CardField>
                <CardField label={`${t('For sheet size')}: ${t('Width')}`}>
                  <LengthInput
                    aria-label={t('Sheet width for the price of {{name}}', { name: m.name })}
                    placeholder={t('Width')}
                    value={m.sheetWidth}
                    onCommit={(sheetWidth) => updateMaterial(m.id, { sheetWidth })}
                  />
                </CardField>
              </CardFields>
            )}
            <CardField label={t('Grain')}>
              <select
                aria-label={t('Grain of {{name}}', { name: m.name })}
                value={materialGrain(m)}
                onChange={(e) => updateMaterial(m.id, { grain: e.target.value as Grain })}
              >
                <option value="length">{t('Along the length')}</option>
                <option value="width">{t('Along the width')}</option>
                <option value="none">{t('No grain')}</option>
              </select>
            </CardField>
            <CardField label={t('Colour')}>
              <input
                type="color"
                aria-label={t('Colour of {{name}}', { name: m.name })}
                value={m.color}
                style={{ textAlign: 'start' }}
                onChange={(e) => updateMaterial(m.id, { color: e.target.value })}
              />
            </CardField>
            {used > 0 && <p className={cardStyles.hint}>{t('in_n_projects', { count: used })}</p>}
            <CardActions>
              <button
                type="button"
                data-danger=""
                onClick={async () => {
                  const ok =
                    used === 0 ||
                    (await confirmDialog({
                      title: t('Delete material?'),
                      message: t('delete_material_in_use', { name: m.name, count: used }),
                      confirmLabel: t('Delete'),
                      danger: true,
                    }));
                  if (ok) removeMaterial(m.id);
                }}
              >
                {t('Delete')}
              </button>
            </CardActions>
          </RowCard>
        );
      })}
    </div>
  );
}

export function BandCards({
  bands,
  openId,
  setOpenId,
}: {
  bands: EdgeBand[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const currency = useStore((s) => s.settings.currency);
  if (bands.length === 0) return <p className={styles.empty}>{t('No edge bands yet.')}</p>;
  return (
    <div className={cardStyles.list}>
      {bands.map((b) => {
        const open = openId === b.id;
        const shown = b.pricePerMetre === null ? null : exact(longPriceOut(b.pricePerMetre));
        return (
          <RowCard
            key={b.id}
            open={open}
            onToggle={() => setOpenId(open ? null : b.id)}
            label={b.name}
            title={b.name}
            lines={[
              shown === null
                ? '—'
                : `${formatMoney(shown, currency)} / ${isImperial() ? 'ft' : 'm'}`,
            ]}
          >
            <CardField label={t('Name')}>
              <input
                aria-label={t('Edge band name')}
                data-band={b.id}
                value={b.name}
                style={{ textAlign: 'start' }}
                onChange={(e) => updateEdgeBand(b.id, { name: e.target.value })}
              />
            </CardField>
            <CardField label={isImperial() ? t('Price per foot') : t('Price per metre')}>
              <NumberInput
                aria-label={
                  isImperial()
                    ? t('Price per foot of {{name}}', { name: b.name })
                    : t('Price per metre of {{name}}', { name: b.name })
                }
                aria-invalid={b.pricePerMetre === null || undefined}
                placeholder="—"
                format={formatPrice}
                value={shown}
                onCommit={(v) =>
                  updateEdgeBand(b.id, { pricePerMetre: v === null ? null : longPriceIn(v) })
                }
              />
            </CardField>
            <CardActions>
              <button type="button" data-danger="" onClick={() => removeEdgeBand(b.id)}>
                {t('Delete')}
              </button>
            </CardActions>
          </RowCard>
        );
      })}
    </div>
  );
}
