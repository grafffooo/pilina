// Scaled horizontal SVG diagram of one 1D linear bar on light "paper":
// placements, keepable tail offcut, numbered saw cuts, and a length ruler.
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { BarLayout } from '../engine/types';
import { formatLength, formatLengthUnit } from '../lib/units';
import { DEFAULT_LINEAR_OFFCUT_MIN, linearKeepAdvice } from '../model/offcut';
import { useView } from '../store/view';
import type { LinearPartInfo } from './partInfo';
import styles from './Results.module.css';

const INK = '#2A2119';
const INK_2 = '#5E5040';
const PART_STROKE = '#6A5B4A';
const TRIM = '#DD6B0B';
const CROSS = '#B42318';

const W = 1000;
const BAR_H = 92;
const TOP = 38;
const BOT = 34;
const PAD_X = 24;
const VB_W = W + 2 * PAD_X;
const VB_H = TOP + BAR_H + BOT;

const textWidth = (text: string, size: number) => text.length * size * 0.56;

function fitBarLines(lines: string[], width: number): { lines: string[]; size: number } | null {
  if (lines.length === 0 || width < 28) return null;
  const maxW = width - 10;
  for (const size of [14, 12, 10]) {
    if (lines.every((l) => textWidth(l, size) <= maxW)) return { lines, size };
  }
  if (lines.length > 1) {
    for (const size of [12, 10]) {
      if (textWidth(lines[0]!, size) <= maxW) return { lines: [lines[0]!], size };
    }
  }
  return null;
}

export function BarDrawing({
  bar,
  parts,
  label,
  cutStep,
  minOffcutLength = DEFAULT_LINEAR_OFFCUT_MIN,
}: {
  bar: BarLayout;
  parts: Map<string, LinearPartInfo>;
  label: string;
  /** Cut mode: highlight this cut, dim the ones before it, and ignore the view toggles. */
  cutStep?: number;
  /** Minimum reusable linear offcut length from workshop settings. */
  minOffcutLength?: number;
}) {
  const { t } = useTranslation();
  const view = useView();
  const controlled = cutStep !== undefined;
  const activeCut = controlled ? cutStep : view.activeLinearCut;
  const showLabels = controlled || view.showLabels;
  const showCuts = controlled || view.showCuts;
  const showSizes = controlled || view.showSizes;
  const setActiveCut = controlled ? () => {} : view.setActiveLinearCut;
  const hatchId = useId();

  const scale = bar.length > 0 ? W / bar.length : 1;
  const offcutX = PAD_X + bar.offcutStart * scale;
  const offcutW = Math.max(0, bar.waste * scale);
  const offcutLines = [
    ...(showLabels ? [t('Offcut')] : []),
    ...(showSizes ? [formatLength(bar.waste)] : []),
  ];
  const offcutFit =
    bar.waste > 0 &&
    linearKeepAdvice(bar.waste, minOffcutLength) === 'suggested' &&
    offcutW >= 48
      ? fitBarLines(offcutLines, offcutW)
      : null;

  const rulerY = TOP + BAR_H + 12;

  return (
    <svg
      className={styles.barDrawing}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={label}
      fontFamily="'Inter Variable', Inter, system-ui, sans-serif"
    >
      <defs>
        <pattern
          id={hatchId}
          width={16}
          height={16}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={16} height={16} fill="#EEE6D9" />
          <line x1="0" y1="0" x2="0" y2={16} stroke="#DACDB8" strokeWidth={4} />
        </pattern>
      </defs>

      <rect
        x={PAD_X}
        y={TOP}
        width={W}
        height={BAR_H}
        fill={`url(#${hatchId})`}
        stroke="#3A2E22"
        strokeWidth={2}
      />

      {offcutFit && (
        <BarLabel
          cx={offcutX + offcutW / 2}
          cy={TOP + BAR_H / 2}
          size={offcutFit.size}
          lines={offcutFit.lines}
          muted
        />
      )}

      {bar.placements.map((p) => {
        const info = parts.get(p.partId);
        const px = PAD_X + p.x * scale;
        const pw = p.length * scale;
        const lines: string[] = [];
        if (showLabels) lines.push(info?.label ?? '?');
        if (showSizes) lines.push(formatLength(p.length));
        const fit = fitBarLines(lines, pw);
        return (
          <g key={`${p.partId}-${p.instance}`}>
            <rect
              x={px}
              y={TOP}
              width={pw}
              height={BAR_H}
              fill={info?.color ?? '#eee'}
              stroke={PART_STROKE}
              strokeWidth={1.2}
            />
            {fit && (
              <BarLabel
                cx={px + pw / 2}
                cy={TOP + BAR_H / 2}
                size={fit.size}
                lines={fit.lines}
              />
            )}
          </g>
        );
      })}

      {showCuts &&
        bar.cuts.map((c) => {
          const cx = PAD_X + c.pos * scale;
          const trim = c.stage === 0;
          const active = c.number === activeCut;
          const done = controlled && c.number < activeCut!;
          const color = trim ? TRIM : CROSS;
          return (
            <g key={c.number} opacity={done ? 0.3 : 1}>
              {active && (
                <line
                  x1={cx}
                  y1={TOP - 6}
                  x2={cx}
                  y2={TOP + BAR_H + 4}
                  stroke={color}
                  strokeOpacity={0.24}
                  strokeWidth={10}
                  strokeLinecap="round"
                />
              )}
              <line
                x1={cx}
                y1={TOP}
                x2={cx}
                y2={TOP + BAR_H}
                stroke={color}
                strokeWidth={active ? 3.5 : trim ? 2.4 : 2}
                strokeDasharray={trim ? undefined : '6 4'}
              />
              <line
                x1={cx}
                y1={TOP - 8}
                x2={cx}
                y2={TOP + BAR_H + 4}
                stroke="transparent"
                strokeWidth={14}
                onPointerEnter={() => setActiveCut(c.number)}
                onPointerLeave={() => setActiveCut(null)}
              />
            </g>
          );
        })}

      {showCuts &&
        bar.cuts
          .filter((c) => c.number === activeCut)
          .map((c) => {
            const cx = PAD_X + c.pos * scale;
            const trim = c.stage === 0;
            const r = 12;
            return (
              <g key="badge" pointerEvents="none">
                <circle cx={cx} cy={16} r={r} fill={trim ? TRIM : CROSS} />
                <text
                  x={cx}
                  y={16}
                  dy="0.35em"
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill={trim ? INK : '#FFFFFF'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {c.number}
                </text>
              </g>
            );
          })}

      {/* Bottom stock length ruler */}
      <g pointerEvents="none" stroke={INK_2} strokeWidth={1.2}>
        <line x1={PAD_X} y1={rulerY} x2={PAD_X + W} y2={rulerY} />
        <line x1={PAD_X} y1={rulerY - 4} x2={PAD_X} y2={rulerY + 4} />
        <line x1={PAD_X + W} y1={rulerY - 4} x2={PAD_X + W} y2={rulerY + 4} />
      </g>
      <text
        x={PAD_X + W / 2}
        y={rulerY + 17}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill={INK_2}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatLengthUnit(bar.length)}
      </text>
    </svg>
  );
}

function BarLabel({
  cx,
  cy,
  size,
  lines,
  muted,
}: {
  cx: number;
  cy: number;
  size: number;
  lines: string[];
  muted?: boolean;
}) {
  const lineH = size * 1.25;
  const top = -((lines.length - 1) * lineH) / 2;
  return (
    <text x={cx} y={cy} textAnchor="middle" fontSize={size} pointerEvents="none">
      {lines.map((line, i) => (
        <tspan
          key={i}
          x={cx}
          y={cy + top + i * lineH}
          dy="0.35em"
          fontWeight={i === 0 ? 600 : 400}
          fontSize={i === 0 ? size : size * 0.85}
          fill={muted || i > 0 ? INK_2 : INK}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}
