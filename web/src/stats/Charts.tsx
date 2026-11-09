// Small single-series charts in plain SVG: columns, a line, and ranked bars.
// Marks follow the data-viz specs: ≤24px columns with 4px rounded tops, 2px lines,
// ≥8px markers with a 2px surface ring, hairline grid, text in text colours only.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { niceTicks } from '../model/stats';
import { t } from '../i18n';
import styles from './Stats.module.css';

export interface Point {
  /** Axis label, e.g. "Nov". */
  label: string;
  /** Full label for tooltips and the table, e.g. "November 2026". */
  longLabel: string;
  value: number | null;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const H = 200;
const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

interface ChartProps {
  points: Point[];
  format: (v: number) => string;
  /** Axis tick format (shorter). */
  tickFormat?: (v: number) => string;
  /** Accessible summary of the whole chart. */
  label: string;
  /** Fixed axis maximum (e.g. 100 for percentages). */
  max?: number;
}

/** Tooltip shown over the hovered or focused mark: value first, then the label. */
function Tip({ x, y, value, label }: { x: number; y: number; value: string; label: string }) {
  return (
    <div className={styles.tip} style={{ left: x, top: y }} role="status">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Axis({
  ticks,
  scale,
  width,
  format,
}: {
  ticks: number[];
  scale: (v: number) => number;
  width: number;
  format: (v: number) => string;
}) {
  return (
    <g className={styles.axis}>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={scale(t)}
            y2={scale(t)}
            className={t === 0 ? styles.baseline : styles.gridLine}
          />
          <text x={PAD.left - 8} y={scale(t)} dy="0.32em" textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Which x labels to print so they don't collide. */
function labelStep(n: number, width: number) {
  return Math.max(1, Math.ceil(n / Math.max(1, Math.floor((width - PAD.left - PAD.right) / 44))));
}

export function ColumnChart({ points, format, tickFormat = format, label, max }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const top = max ?? Math.max(0, ...points.map((p) => p.value ?? 0));
  const ticks = niceTicks(top);
  const yMax = ticks.at(-1)!;
  const scale = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / yMax);
  const band = (width - PAD.left - PAD.right) / Math.max(1, points.length);
  const barW = Math.min(24, Math.max(4, band * 0.6));
  const step = labelStep(points.length, width);

  return (
    <div ref={ref} className={styles.chart}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={label}>
          <Axis ticks={ticks} scale={scale} width={width} format={tickFormat} />
          {points.map((p, i) => {
            const cx = PAD.left + band * (i + 0.5);
            const v = p.value ?? 0;
            const y = scale(v);
            const h = scale(0) - y;
            const r = Math.min(4, h, barW / 2);
            const x = cx - barW / 2;
            return (
              <g key={p.longLabel}>
                {h > 0 && (
                  <path
                    className={hover === i ? styles.markHover : styles.mark}
                    d={`M${x},${scale(0)} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${scale(0)} Z`}
                  />
                )}
                {i % step === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" className={styles.xLabel}>
                    {p.label}
                  </text>
                )}
                {/* The whole band is the hit target, not just the painted bar. */}
                <rect
                  x={cx - band / 2}
                  y={PAD.top}
                  width={band}
                  height={H - PAD.top - PAD.bottom}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${p.longLabel}: ${p.value === null ? t('no data') : format(v)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tip
          x={PAD.left + band * (hover + 0.5)}
          y={scale(points[hover].value ?? 0)}
          value={points[hover].value === null ? '—' : format(points[hover].value!)}
          label={points[hover].longLabel}
        />
      )}
    </div>
  );
}

export function LineChart({ points, format, tickFormat = format, label, max }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const top = max ?? Math.max(0, ...points.map((p) => p.value ?? 0));
  const ticks = niceTicks(top);
  const yMax = ticks.at(-1)!;
  const scale = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / yMax);
  const band = (width - PAD.left - PAD.right) / Math.max(1, points.length);
  const xAt = (i: number) => PAD.left + band * (i + 0.5);
  const step = labelStep(points.length, width);

  // Months without data break the line instead of dropping to zero.
  const segments: string[] = [];
  let current = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = '';
    } else current += `${current ? 'L' : 'M'}${xAt(i)},${scale(p.value)}`;
  });
  if (current) segments.push(current);

  const onMove = (clientX: number, svg: SVGSVGElement) => {
    const x = clientX - svg.getBoundingClientRect().left;
    const i = Math.round((x - PAD.left) / band - 0.5);
    setHover(i >= 0 && i < points.length ? i : null);
  };

  return (
    <div ref={ref} className={styles.chart}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
            if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? points.length) - 1));
          }}
          onBlur={() => setHover(null)}
        >
          <Axis ticks={ticks} scale={scale} width={width} format={tickFormat} />
          {points.map(
            (p, i) =>
              i % step === 0 && (
                <text
                  key={p.longLabel}
                  x={xAt(i)}
                  y={H - 8}
                  textAnchor="middle"
                  className={styles.xLabel}
                >
                  {p.label}
                </text>
              ),
          )}
          {hover !== null && (
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PAD.top}
              y2={scale(0)}
              className={styles.crosshair}
            />
          )}
          {segments.map((d, i) => (
            <path key={i} d={d} className={styles.line} />
          ))}
          {points.map((p, i) =>
            p.value === null ? null : (
              <circle
                key={i}
                cx={xAt(i)}
                cy={scale(p.value)}
                r={hover === i ? 5 : 4}
                className={styles.dot}
              />
            ),
          )}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tip
          x={xAt(hover)}
          y={scale(points[hover].value ?? 0)}
          value={points[hover].value === null ? t('no sheets cut') : format(points[hover].value!)}
          label={points[hover].longLabel}
        />
      )}
    </div>
  );
}

/** Ranked horizontal bars, largest first, value at the tip. */
export function BarList({
  items,
  format,
}: {
  items: { name: string; value: number; note?: string }[];
  format: (v: number) => string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <ol className={styles.barList}>
      {items.map((it) => (
        <li key={it.name} title={it.note}>
          <span className={styles.barName}>{it.name}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{ width: `${max > 0 ? (it.value / max) * 100 : 0}%` }}
            />
            <span className={styles.barValue}>{format(it.value)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Data table behind a chart, so no value depends on hovering. */
export function TableView({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <details className={styles.tableView}>
      <summary>{t('Show as table')}</summary>
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i > 0 ? styles.num : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j > 0 ? styles.num : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
