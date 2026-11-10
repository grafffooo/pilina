// Where to set the fence (or lay the track): measured from the edge of the piece being cut,
// which is the previous cut's edge, rather than from the original sheet's edge.
//
// The cuts are replayed in sawing order. Each cut splits one piece in two; the measurement
// runs from that piece's left (or top) edge to the near side of the saw kerf, so it is the
// size of the piece that comes off on that side. Cut positions (`pos`) are kerf centres.
import type { Cut, SheetLayout } from '../engine/types';

export type MeasureFrom = 'piece' | 'sheet';

interface Piece {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutMeasure {
  /** Distance to set, mm. */
  offset: number;
  /** Size of the piece being cut along the measured direction, mm. */
  pieceSize: number;
  /** Couldn't tell which piece the cut splits, so this is from the sheet edge. */
  fromSheet?: true;
}

const EPS = 0.5;

/** For each cut number: how far from the edge of the piece it splits. */
export function measureFromPiece(sheet: SheetLayout, kerf: number): Map<number, CutMeasure> {
  const out = new Map<number, CutMeasure>();
  let pieces: Piece[] = [{ x: 0, y: 0, w: sheet.width, h: sheet.length }];
  const half = kerf / 2;
  for (const c of [...sheet.cuts].sort((a, b) => a.number - b.number)) {
    const i = pieces.findIndex((p) => contains(p, c));
    if (i < 0) {
      // Shouldn't happen; fall back to the sheet edge so the number is still right.
      out.set(c.number, {
        offset: c.pos - half,
        pieceSize: c.axis === 'x' ? sheet.width : sheet.length,
        fromSheet: true,
      });
      continue;
    }
    const p = pieces[i]!;
    const start = c.axis === 'x' ? p.x : p.y;
    const size = c.axis === 'x' ? p.w : p.h;
    const end = start + size;
    // A sliver thinner than a kerf has its cut in the middle (see layout.rs).
    const near = Math.max(start, c.pos - half);
    const far = Math.min(end, c.pos + half);
    out.set(c.number, { offset: round2(near - start), pieceSize: round2(size) });
    const a: Piece = c.axis === 'x' ? { ...p, w: near - p.x } : { ...p, h: near - p.y };
    const b: Piece =
      c.axis === 'x' ? { ...p, x: far, w: end - far } : { ...p, y: far, h: end - far };
    pieces = [...pieces.slice(0, i), a, b, ...pieces.slice(i + 1)].filter(
      (q) => q.w > EPS && q.h > EPS,
    );
  }
  return out;
}

/** The piece a cut runs across: its line passes through the piece's inside. Line ends can
 *  reach into the kerf of earlier cuts, so the line's middle decides, not its ends. */
function contains(p: Piece, c: Cut): boolean {
  const mx = (c.x1 + c.x2) / 2;
  const my = (c.y1 + c.y2) / 2;
  const insideX = (x: number) => x > p.x - EPS && x < p.x + p.w + EPS;
  const insideY = (y: number) => y > p.y - EPS && y < p.y + p.h + EPS;
  return c.axis === 'x' ? insideX(c.pos) && insideY(my) : insideY(c.pos) && insideX(mx);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The number to show for a cut: from the piece's edge, or the sheet's (the kerf centre). */
export function cutPosition(
  c: Cut,
  from: MeasureFrom,
  measures: Map<number, CutMeasure> | null,
): number {
  if (from === 'sheet' || !measures) return c.pos;
  return measures.get(c.number)?.offset ?? c.pos;
}
