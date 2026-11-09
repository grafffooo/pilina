// Prints offcut labels on A4 sticker sheets, starting at the first free sticker.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  labelFormat,
  LABEL_FORMATS,
  layoutLabels,
  stickerPosition,
  type LabelFormat,
  type Offcut,
} from '../model/offcut';
import type { Material, Settings } from '../model/library';
import { updateSettings, useStore } from '../store/store';
import { ChevronLeftIcon, MenuIcon, WarningIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import { QrCode } from './QrCode';
import styles from './Labels.module.css';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

type PrintJob = 'labels' | 'outline' | null;

export function LabelPrint({ onMenu }: { onMenu?: () => void }) {
  const offcuts = useStore((s) => s.offcuts);
  const materials = useStore((s) => s.materials);
  const settings = useStore((s) => s.settings);
  const [printing, setPrinting] = useState<PrintJob>(null);

  const format = labelFormat(settings.labelFormatId);
  const perSheet = format.cols * format.rows;
  const start = Math.min(Math.max(1, settings.labelStart), perSheet);
  const queue = offcuts
    .filter((o) => o.label === 'queued' && o.status !== 'used')
    .sort((a, b) => a.code.localeCompare(b.code));
  const { pages, nextStart } = layoutLabels(queue, format, start);

  const print = (job: Exclude<PrintJob, null>) => {
    setPrinting(job);
    // Let React render the print sheet, then open the print dialog.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        setPrinting(null);
        if (job === 'labels' && queue.length > 0) {
          const ok = window.confirm(
            `Did the ${queue.length} ${queue.length === 1 ? 'label' : 'labels'} print correctly? They'll be marked as printed, and the next print starts at sticker ${nextStart}.`,
          );
          if (ok) {
            useStore.getState().updateOffcuts(
              queue.map((o) => o.id),
              { label: 'printed' },
            );
            updateSettings({ labelStart: nextStart });
          }
        }
      }),
    );
  };

  const first = queue[0];

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        {onMenu && (
          <button type="button" className={ui.iconButton} aria-label="Projects" onClick={onMenu}>
            <MenuIcon size={22} />
          </button>
        )}
        <button
          type="button"
          className={ui.button}
          onClick={() => useStore.getState().setView('offcuts')}
        >
          <ChevronLeftIcon size={16} />
          Offcut library
        </button>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Print labels</h1>
          <span className={styles.meta}>
            {queue.length} {queue.length === 1 ? 'label' : 'labels'} · A4 sticker sheet
            {pages.length > 1 ? ` · ${pages.length} sheets` : ''}
          </span>
        </div>
        <button type="button" className={ui.button} onClick={() => print('outline')}>
          Print outline test page
        </button>
        <button
          type="button"
          className={ui.buttonPrimary}
          disabled={queue.length === 0}
          onClick={() => print('labels')}
        >
          Print {queue.length} {queue.length === 1 ? 'label' : 'labels'}
        </button>
      </div>

      <div className={styles.columns}>
        <section className={styles.settings} aria-label="Print settings">
          <fieldset className={styles.group}>
            <legend>Sticker sheet</legend>
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
                  <span className={styles.radioNote}>{f.cols * f.rows} per sheet</span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Start at sticker</legend>
            <div
              className={styles.mini}
              style={{ gridTemplateColumns: `repeat(${format.cols}, 1fr)` }}
              role="group"
              aria-label="Choose the first free sticker"
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
                    aria-label={`Start at sticker ${n}`}
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
                ? `Stickers 1–${start - 1} are marked as used. Click the first free one.`
                : 'A fresh sheet. If some stickers are used, click the first free one.'}
            </p>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Show on label</legend>
            <label className={styles.checkRow}>
              <input type="checkbox" checked disabled />
              ID, size and QR code (always)
            </label>
            {(
              [
                ['material', 'Material and thickness'],
                ['location', 'Storage place'],
                ['source', 'Source project and date'],
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
              Print at <strong>100% / actual size</strong> with “Fit to page” off and no margins, or
              the labels drift off the stickers. Try the outline test page on plain paper first.
            </span>
          </p>
        </section>

        <section className={styles.preview} aria-label="A4 preview">
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
            A4 preview · page 1 of {Math.max(1, pages.length)}
            {queue.length > 0 && ` · next print starts at sticker ${nextStart}`}
          </span>
        </section>

        {first && (
          <section className={styles.zoom} aria-label="One label, enlarged">
            <span className={styles.zoomTitle}>
              One label, enlarged ({format.labelW} × {format.labelH} mm)
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
            {used && !numbers && <span className={styles.usedText}>used</span>}
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
    ? [m.name, m.thickness ? `${m.thickness} mm` : null].filter(Boolean).join(' · ')
    : null;
  const source = [offcut.sourceProjectName, dateFormat.format(offcut.createdAt)]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={styles.label} style={{ padding: `${pad}mm`, gap: `${pad}mm` }}>
      <QrCode text={offcut.code} size={`${qr}mm`} />
      <div className={styles.labelText}>
        <span className={styles.labelCode}>{offcut.code}</span>
        <span className={styles.labelSize}>
          {offcut.length} × {offcut.width}
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
