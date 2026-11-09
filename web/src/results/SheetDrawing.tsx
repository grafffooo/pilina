// SVG drawing of one sheet in millimetres: parts, leftovers, cuts and edge banding.
// Colours are fixed (not themed) because the sheet always sits on light "paper".
import { useId } from 'react';
import type { SheetLayout } from '../engine/types';
import { classifyOffcut, edgeSides, isRipLike, sizeOf } from '../model/describe';
import { formatMm } from '../lib/format';
import { useView } from '../store/view';
import type { PartInfo } from './partInfo';
import styles from './Results.module.css';

const INK = '#1B2029';
const INK_2 = '#4A5260';
const PART_STROKE = '#5D6573';
const RIP = '#DD6B0B';
const CROSS = '#B42318';
const EDGE = '#0D5C53';

/** Rough text width for Inter at `size`. */
const textWidth = (text: string, size: number) => text.length * size * 0.56;

interface TextFit {
  size: number;
  vertical: boolean;
}

/** Largest font size (between min and max) at which `lines` fit in a w × h box. */
function fitText(lines: string[], w: number, h: number, max: number, min: number): TextFit | null {
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
  for (let size = max; size >= min; size *= 0.85) {
    const tw = textWidth(longest, size);
    const th = size * 1.25 * lines.length;
    if (tw <= w * 0.9 && th <= h * 0.9) return { size, vertical: false };
    if (tw <= h * 0.9 && th <= w * 0.9) return { size, vertical: true };
  }
  return null;
}

export function SheetDrawing({
  sheet,
  parts,
  label,
}: {
  sheet: SheetLayout;
  parts: Map<string, PartInfo>;
  label: string;
}) {
  const { activeCut, showCuts, showSizes, showEdges, setActiveCut } = useView();
  const hatchId = useId();
  const w = sheet.width;
  const l = sheet.length;
  const m = Math.max(w, l);
  const pad = m * 0.035;
  const stroke = m * 0.0018;

  return (
    <svg
      className={styles.drawing}
      viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${l + 2 * pad}`}
      role="img"
      aria-label={label}
      fontFamily="'Inter Variable', Inter, system-ui, sans-serif"
    >
      <defs>
        <pattern
          id={hatchId}
          width={m * 0.017}
          height={m * 0.017}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={m * 0.017} height={m * 0.017} fill="#ECEEF1" />
          <line x1="0" y1="0" x2="0" y2={m * 0.017} stroke="#D3D8DF" strokeWidth={m * 0.0045} />
        </pattern>
      </defs>

      <rect
        width={w}
        height={l}
        fill={`url(#${hatchId})`}
        stroke="#2B313B"
        strokeWidth={m * 0.0035}
      />

      {/* Reusable leftovers get their size written on them. */}
      {sheet.waste
        .filter((r) => classifyOffcut(r) === 'usable')
        .map((r, i) => {
          const s = sizeOf(r);
          const lines = ['Offcut', `${formatMm(s.long)} × ${formatMm(s.short)}`];
          const fit = fitText(lines, r.w, r.h, m * 0.024, m * 0.012);
          return (
            fit && (
              <Label key={`w${i}`} x={r.x} y={r.y} w={r.w} h={r.h} fit={fit} lines={lines} muted />
            )
          );
        })}

      {sheet.placements.map((p) => {
        const info = parts.get(p.partId);
        const r = p.rect;
        const lines = [info?.label ?? '?'];
        if (showSizes && info) lines.push(`${formatMm(info.length)} × ${formatMm(info.width)}`);
        const fit = fitText(lines, r.w, r.h, m * 0.026, m * 0.011);
        return (
          <g key={`${p.partId}-${p.instance}`}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill={info?.color ?? '#eee'}
              stroke={PART_STROKE}
              strokeWidth={stroke}
            />
            {showEdges && info && (
              <EdgeMarks rect={r} placement={p} edges={info.edges} width={m * 0.006} />
            )}
            {fit && <Label x={r.x} y={r.y} w={r.w} h={r.h} fit={fit} lines={lines} />}
          </g>
        );
      })}

      {showCuts &&
        sheet.cuts.map((c) => {
          const rip = isRipLike(c);
          const active = c.number === activeCut;
          return (
            <g key={c.number}>
              {active && (
                <line
                  x1={c.x1}
                  y1={c.y1}
                  x2={c.x2}
                  y2={c.y2}
                  stroke={rip ? RIP : CROSS}
                  strokeOpacity={0.22}
                  strokeWidth={m * 0.016}
                  strokeLinecap="round"
                />
              )}
              <line
                x1={c.x1}
                y1={c.y1}
                x2={c.x2}
                y2={c.y2}
                stroke={rip ? RIP : CROSS}
                strokeWidth={(rip ? m * 0.004 : m * 0.0032) * (active ? 1.6 : 1)}
                strokeDasharray={rip ? undefined : `${m * 0.012} ${m * 0.008}`}
              />
              {/* Wide invisible line so cuts are easy to point at. */}
              <line
                x1={c.x1}
                y1={c.y1}
                x2={c.x2}
                y2={c.y2}
                stroke="transparent"
                strokeWidth={m * 0.014}
                onPointerEnter={() => setActiveCut(c.number)}
                onPointerLeave={() => setActiveCut(null)}
              />
            </g>
          );
        })}

      {showCuts &&
        sheet.cuts
          .filter((c) => c.number === activeCut)
          .map((c) => {
            const rip = isRipLike(c);
            const r = m * 0.024;
            return (
              <g key="badge" pointerEvents="none">
                <circle cx={c.x1} cy={c.y1} r={r} fill={rip ? RIP : CROSS} />
                <text
                  x={c.x1}
                  y={c.y1}
                  dy="0.35em"
                  textAnchor="middle"
                  fontSize={r * 1.1}
                  fontWeight={700}
                  fill={rip ? INK : '#FFFFFF'}
                >
                  {c.number}
                </text>
              </g>
            );
          })}
    </svg>
  );
}

function Label({
  x,
  y,
  w,
  h,
  fit,
  lines,
  muted,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fit: TextFit;
  lines: string[];
  muted?: boolean;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const lineH = fit.size * 1.25;
  const top = -((lines.length - 1) * lineH) / 2;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      fontSize={fit.size}
      transform={fit.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
      pointerEvents="none"
    >
      {lines.map((line, i) => (
        <tspan
          key={i}
          x={cx}
          y={cy + top + i * lineH}
          dy="0.35em"
          fontWeight={i === 0 ? 600 : 400}
          fontSize={i === 0 ? fit.size : fit.size * 0.85}
          fill={muted || i > 0 ? INK_2 : INK}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function EdgeMarks({
  rect,
  placement,
  edges,
  width,
}: {
  rect: { x: number; y: number; w: number; h: number };
  placement: Parameters<typeof edgeSides>[0];
  edges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  width: number;
}) {
  const sides = edgeSides(placement);
  const i = width / 2;
  const seg = {
    top: [rect.x, rect.y + i, rect.x + rect.w, rect.y + i],
    bottom: [rect.x, rect.y + rect.h - i, rect.x + rect.w, rect.y + rect.h - i],
    left: [rect.x + i, rect.y, rect.x + i, rect.y + rect.h],
    right: [rect.x + rect.w - i, rect.y, rect.x + rect.w - i, rect.y + rect.h],
  } as const;
  return (
    <>
      {(['top', 'bottom', 'left', 'right'] as const)
        .filter((e) => edges[e])
        .map((e) => {
          const [x1, y1, x2, y2] = seg[sides[e]];
          return <line key={e} x1={x1} y1={y1} x2={x2} y2={y2} stroke={EDGE} strokeWidth={width} />;
        })}
    </>
  );
}
