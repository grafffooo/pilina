// Prints offcut labels on A4 sticker sheets, starting at the first free sticker.
import { formatLength, formatLengthUnit } from '../lib/units';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CUSTOM_LABEL_ID,
  DEFAULT_CUSTOM_LABEL,
  labelFormat,
  labelOverflow,
  LABEL_FORMATS,
  layoutLabels,
  stickerPosition,
  type LabelFormat,
  type Offcut,
} from '../model/offcut';
import type { Material, Settings } from '../model/library';
import { updateSettings, useStore } from '../store/store';
import { MenuIcon, WarningIcon } from '../ui/icons';
import { BackButton } from '../ui/BackButton';
import ui from '../ui/ui.module.css';
import { NumberInput } from '../ui/NumberInput';
import { formatNumber } from '../lib/format';
import { QrCode } from './QrCode';
import { confirmDialog } from '../ui/dialogs';
import { locale } from '../i18n';
import styles from './Labels.module.css';
import { useTranslation } from 'react-i18next';

const dateFormat = () =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

type PrintJob = 'labels' | 'outline' | null;

export function LabelPrint({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation();
  const offcuts = useStore((s) => s.offcuts);
  const materials = useStore((s) => s.materials);
  const settings = useStore((s) => s.settings);
  const [printing, setPrinting] = useState<PrintJob>(null);

  const format = labelFormat(settings.labelFormatId, settings.customLabel);
  const perSheet = format.cols * format.rows;
  const start = Math.min(Math.max(1, settings.labelStart), perSheet);
  const queue = offcuts
    .filter((o) => o.label === 'queued' && o.status !== 'used')
    .sort((a, b) => a.code.localeCompare(b.code));
  const { pages, nextStart } = layoutLabels(queue, format, start);

  const print = async (job: Exclude<PrintJob, null>) => {
    setPrinting(job);
    // Let React render the print sheet before printing.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // In the Mac app window.print() opens the native print panel and returns a promise.
    await (window.print() as unknown as Promise<void> | undefined);
    if (job === 'labels' && queue.length > 0) {
      const ok = await confirmDialog({
        title: t('Did the labels print correctly?'),
        message: t('did_labels_print', { count: queue.length, next: nextStart }),
        confirmLabel: t('Mark as printed'),
        cancelLabel: t('Not yet'),
      });
      if (ok) {
        useStore.getState().updateOffcuts(
          queue.map((o) => o.id),
          { label: 'printed' },
        );
        updateSettings({ labelStart: nextStart });
      }
    }
    // Keep the print sheet until here, in case printing finishes after the call returns.
    setPrinting(null);
  };

  const first = queue[0];

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
            <h1 className={styles.title}>{t('Print labels')}</h1>
            <BackButton to="offcuts" label={t('Offcut library')} />
          </div>
          <span className={styles.meta}>
            {t('n_labels', { count: queue.length })} · {t('A4 sticker sheet')}
            {pages.length > 1 ? ` · ${t('n_label_sheets', { count: pages.length })}` : ''}
          </span>
        </div>
        <button type="button" className={ui.button} onClick={() => void print('outline')}>
          {t('Print outline test page')}
        </button>
        <button
          type="button"
          className={ui.buttonPrimary}
          disabled={queue.length === 0}
          onClick={() => void print('labels')}
        >
          {t('print_n_labels', { count: queue.length })}
        </button>
      </div>

      <div className={styles.columns}>
        <section className={styles.settings} aria-label={t('Print settings')}>
          <fieldset className={styles.group}>
            <legend>{t('Sticker sheet')}</legend>
            {LABEL_FORMATS.map((f) => (
              <label key={f.id} className={styles.radio}>
                <input
                  type="radio"
                  name="label-format"
                  checked={f.id === format.id}
                  onChange={() => updateSettings({ labelFormatId: f.id, labelStart: 1 })}
                />
                <span>
                  <span className={styles.radioTitle}>A4 · {f.name}</span>
                  <span className={styles.radioNote}>
                    {t('{{count}} per sheet', { count: f.cols * f.rows })}
                  </span>
                </span>
              </label>
            ))}
            <label className={styles.radio}>
              <input
                type="radio"
                name="label-format"
                checked={format.id === CUSTOM_LABEL_ID}
                onChange={() =>
                  updateSettings({
                    labelFormatId: CUSTOM_LABEL_ID,
                    customLabel: settings.customLabel ?? DEFAULT_CUSTOM_LABEL,
                    labelStart: 1,
                  })
                }
              />
              <span>
                <span className={styles.radioTitle}>{t('Custom size')}</span>
                <span className={styles.radioNote}>
                  {format.id === CUSTOM_LABEL_ID
                    ? `${format.cols} × ${format.rows} · ${formatNumber(format.labelW)} × ${formatNumber(format.labelH)} mm · ${t('{{count}} per sheet', { count: format.cols * format.rows })}`
                    : t('Measure your sticker sheet')}
                </span>
              </span>
            </label>
            {format.id === CUSTOM_LABEL_ID && <CustomLabelFields format={format} />}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>{t('Start at sticker')}</legend>
            <div
              className={styles.mini}
              style={{ gridTemplateColumns: `repeat(${format.cols}, 1fr)` }}
              role="group"
              aria-label={t('Choose the first free sticker')}
            >
              {Array.from({ length: perSheet }, (_, i) => {
                const n = i + 1;
                const filled = pages[0]?.some((p) => p.index === i);
                return (
                  <button
                    key={n}
                    type="button"
                    className={
                      n < start ? styles.miniUsed : filled ? styles.miniFilled : styles.miniFree
                    }
                    aria-label={t('Start at sticker {{n}}', { n })}
                    aria-pressed={n === start}
                    onClick={() => updateSettings({ labelStart: n })}
                  >
                    {filled ? '●' : ''}
                  </button>
                );
              })}
            </div>
            <p className={styles.hint}>
              {start > 1
                ? t('Stickers 1–{{last}} are marked as used. Click the first free one.', {
                    last: start - 1,
                  })
                : t('A fresh sheet. If some stickers are used, click the first free one.')}
            </p>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>{t('Show on label')}</legend>
            <label className={styles.checkRow}>
              <input type="checkbox" checked disabled />
              {t('ID, size and QR code (always)')}
            </label>
            {(
              [
                ['material', t('Material and thickness')],
                ['location', t('Storage place')],
                ['source', t('Source project and date')],
              ] as const
            ).map(([key, text]) => (
              <label key={key} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={settings.labelShow[key]}
                  onChange={(e) =>
                    updateSettings({
                      labelShow: { ...settings.labelShow, [key]: e.target.checked },
                    })
                  }
                />
                {text}
              </label>
            ))}
          </fieldset>

          <p className={styles.warning}>
            <WarningIcon size={16} />
            <span>
              {t(
                'Print at 100% / actual size with “Fit to page” off and no margins, or the labels drift off the stickers. Try the outline test page on plain paper first.',
              )}
            </span>
          </p>
        </section>

        <section className={styles.preview} aria-label={t('A4 preview')}>
          <div className={styles.paperFrame}>
            <div className={styles.paperScale}>
              <Sheet
                format={format}
                items={pages[0] ?? []}
                usedBefore={start - 1}
                outline
                materials={materials}
                settings={settings}
              />
            </div>
          </div>
          <span className={styles.meta}>
            {t('A4 preview · page 1 of {{total}}', { total: Math.max(1, pages.length) })}
            {queue.length > 0 && ` · ${t('next print starts at sticker {{n}}', { n: nextStart })}`}
          </span>
        </section>

        {first && (
          <section className={styles.zoom} aria-label={t('One label, enlarged')}>
            <span className={styles.zoomTitle}>
              {t('One label, enlarged ({{w}} × {{h}} mm)', { w: format.labelW, h: format.labelH })}
            </span>
            <div
              className={styles.zoomFrame}
              style={{ aspectRatio: `${format.labelW} / ${format.labelH}` }}
            >
              <div
                className={styles.zoomInner}
                style={{
                  width: `${format.labelW}mm`,
                  height: `${format.labelH}mm`,
                  transform: `scale(${320 / (format.labelW * 3.78)})`,
                }}
              >
                <Label offcut={first} format={format} materials={materials} settings={settings} />
              </div>
            </div>
          </section>
        )}
      </div>

      {printing &&
        createPortal(
          <div className="print-root">
            {printing === 'outline' ? (
              <Sheet
                format={format}
                items={[]}
                usedBefore={0}
                outline
                numbers
                materials={materials}
                settings={settings}
                print
              />
            ) : (
              pages.map((items, i) => (
                <Sheet
                  key={i}
                  format={format}
                  items={items}
                  usedBefore={0}
                  materials={materials}
                  settings={settings}
                  print
                />
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** One A4 page in real millimetres; the preview scales it down. */
function Sheet({
  format,
  items,
  usedBefore,
  outline,
  numbers,
  print,
  materials,
  settings,
}: {
  format: LabelFormat;
  items: { index: number; item: Offcut }[];
  usedBefore: number;
  outline?: boolean;
  numbers?: boolean;
  print?: boolean;
  materials: Material[];
  settings: Settings;
}) {
  const { t } = useTranslation();
  const per = format.cols * format.rows;
  return (
    <div className={print ? 'print-page' : styles.page}>
      {Array.from({ length: per }, (_, i) => {
        const pos = stickerPosition(format, i);
        const item = items.find((x) => x.index === i)?.item;
        const used = i < usedBefore;
        return (
          <div
            key={i}
            className={`${styles.sticker} ${outline ? styles.stickerOutline : ''} ${used ? styles.stickerUsed : ''} ${item && outline ? styles.stickerFilled : ''}`}
            style={{
              left: `${pos.x}mm`,
              top: `${pos.y}mm`,
              width: `${format.labelW}mm`,
              height: `${format.labelH}mm`,
            }}
          >
            {numbers && <span className={styles.stickerNumber}>{i + 1}</span>}
            {used && !numbers && <span className={styles.usedText}>{t('used')}</span>}
            {item && (
              <Label offcut={item} format={format} materials={materials} settings={settings} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Label content in mm: QR on the left, the size in the biggest type. */
function Label({
  offcut,
  format,
  materials,
  settings,
}: {
  offcut: Offcut;
  format: LabelFormat;
  materials: Material[];
  settings: Settings;
}) {
  const pad = 3;
  const qr = Math.min(format.labelH - 2 * pad, 30);
  const m = materials.find((x) => x.id === offcut.materialId);
  const material = m
    ? [m.name, m.thickness ? formatLengthUnit(m.thickness) : null].filter(Boolean).join(' · ')
    : null;
  const source = [offcut.sourceProjectName, dateFormat().format(offcut.createdAt)]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={styles.label} style={{ padding: `${pad}mm`, gap: `${pad}mm` }}>
      <QrCode text={offcut.code} size={`${qr}mm`} />
      <div className={styles.labelText}>
        <span className={styles.labelCode}>{offcut.code}</span>
        <span className={styles.labelSize}>
          {formatLength(offcut.length)} × {formatLength(offcut.width)}
        </span>
        {settings.labelShow.material && material && (
          <span className={styles.labelLine}>{material}</span>
        )}
        {settings.labelShow.location && offcut.location && (
          <span className={styles.labelLine}>{offcut.location}</span>
        )}
        {settings.labelShow.source && <span className={styles.labelSmall}>{source}</span>}
      </div>
    </div>
  );
}

/** The measurements of a sticker sheet that isn't in the list, in millimetres. */
function CustomLabelFields({ format }: { format: LabelFormat }) {
  const { t } = useTranslation();
  const set = (patch: Partial<LabelFormat>) =>
    updateSettings({ customLabel: { ...format, ...patch }, labelStart: 1 });
  const field = (
    key: keyof Pick<
      LabelFormat,
      'cols' | 'rows' | 'labelW' | 'labelH' | 'marginTop' | 'marginLeft' | 'gapX' | 'gapY'
    >,
    label: string,
    whole = false,
  ) => (
    <label className={styles.customField}>
      <span>{label}</span>
      <NumberInput
        className={ui.fieldInput}
        value={format[key]}
        onCommit={(v) => {
          const n = Math.max(whole ? 1 : 0, v ?? 0);
          set({ [key]: whole ? Math.min(20, Math.round(n)) : n });
        }}
      />
    </label>
  );
  const over = labelOverflow(format);
  return (
    <div className={styles.custom}>
      {field('cols', t('Columns'), true)}
      {field('rows', t('Rows'), true)}
      {field('labelW', t('Sticker width, mm'))}
      {field('labelH', t('Sticker height, mm'))}
      {field('marginTop', t('Top margin, mm'))}
      {field('marginLeft', t('Left margin, mm'))}
      {field('gapX', t('Gap across, mm'))}
      {field('gapY', t('Gap down, mm'))}
      {(over.x > 0 || over.y > 0) && (
        <p className={styles.customWarn} role="alert">
          {over.x > 0 && over.y > 0
            ? t(
                'These stickers run {{x}} mm past the page’s width and {{y}} mm past its height. Check the measurements.',
                {
                  x: formatNumber(over.x),
                  y: formatNumber(over.y),
                },
              )
            : over.x > 0
              ? t('These stickers run {{x}} mm past the page’s width. Check the measurements.', {
                  x: formatNumber(over.x),
                })
              : t('These stickers run {{y}} mm past the page’s height. Check the measurements.', {
                  y: formatNumber(over.y),
                })}
        </p>
      )}
    </div>
  );
}
