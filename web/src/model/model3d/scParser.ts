import { unzipSync, strFromU8 } from 'fflate';
import type {
  Matrix4Tuple,
  Model3DBody,
  Model3DComponent,
  Model3DDocument,
  Model3DParser,
} from './types';

interface ScParam {
  name: string;
  expr: string;
  unit?: string;
}

interface ScComponent {
  id: number;
  name: string;
  parent: number;
}

interface ScOccurrence {
  id: number;
  name: string;
  component: number;
  parent: number;
  transform?: number[][];
}

interface ScFeature {
  id: number;
  name: string;
  type: string;
  component: number;
  operation?: string;
  suppressed?: boolean;
  body_names?: string[];
  corner?: Array<number | string>;
  length?: number | string;
  width?: number | string;
  height?: number | string;
}

interface ScAppearance {
  color?: [number, number, number];
  opacity?: number;
}

interface ScDocumentJson {
  format?: string;
  name?: string;
  units?: string;
  params?: ScParam[];
  components?: ScComponent[];
  occurrences?: ScOccurrence[];
  features?: ScFeature[];
  appearances?: {
    bodies?: Record<string, ScAppearance>;
  };
  visibility?: {
    hidden_bodies?: string[];
    hidden_occurrences?: string[];
  };
}

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  inch: 25.4,
  ft: 304.8,
};

function unitScale(unit?: string): number {
  if (!unit) return 1;
  return UNIT_TO_MM[unit.toLowerCase()] ?? 1;
}

/**
 * Safe recursive-descent arithmetic evaluator for SolidCraft parameter & dimension expressions.
 * Supports +, -, *, /, parentheses, unary +/-, numeric literals with optional unit suffixes,
 * and named parameters.
 */
export function evaluateExpr(
  raw: number | string | undefined,
  params: ReadonlyMap<string, number>,
  defaultScale = 1,
): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw * defaultScale : 0;
  if (raw == null) return 0;
  const input = String(raw).trim();
  if (!input) return 0;

  let pos = 0;
  const skipWs = () => {
    while (pos < input.length && /\s/.test(input[pos]!)) pos++;
  };

  const parseExpr = (): number => {
    let left = parseTerm();
    while (true) {
      skipWs();
      const ch = input[pos];
      if (ch === '+') {
        pos++;
        left += parseTerm();
      } else if (ch === '-') {
        pos++;
        left -= parseTerm();
      } else {
        break;
      }
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parseFactor();
    while (true) {
      skipWs();
      const ch = input[pos];
      if (ch === '*') {
        pos++;
        left *= parseFactor();
      } else if (ch === '/') {
        pos++;
        const right = parseFactor();
        left = right === 0 ? 0 : left / right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseFactor = (): number => {
    skipWs();
    const ch = input[pos];
    if (ch === '+') {
      pos++;
      return parseFactor();
    }
    if (ch === '-') {
      pos++;
      return -parseFactor();
    }
    if (ch === '(') {
      pos++;
      const val = parseExpr();
      skipWs();
      if (input[pos] === ')') pos++;
      return val;
    }

    // Number literal (with optional trailing unit like "18 mm")
    const numMatch = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(input.slice(pos));
    if (numMatch) {
      pos += numMatch[0].length;
      let val = parseFloat(numMatch[0]);
      skipWs();
      const unitMatch = /^(mm|cm|m|in|inch|ft)\b/i.exec(input.slice(pos));
      if (unitMatch) {
        pos += unitMatch[0].length;
        val *= unitScale(unitMatch[1]);
        return val;
      }
      return val * defaultScale;
    }

    // Identifier (parameter name)
    const idMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(pos));
    if (idMatch) {
      pos += idMatch[0].length;
      return params.get(idMatch[0]) ?? 0;
    }

    throw new Error(`Unexpected token in expression "${input}" at position ${pos}`);
  };

  const result = parseExpr();
  return Number.isFinite(result) ? result : 0;
}

const IDENTITY_MATRIX: Matrix4Tuple = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function rowMajorToColMajor(m: number[][] | undefined, docScale: number): Matrix4Tuple {
  if (!m || m.length < 4) return [...IDENTITY_MATRIX];
  // SolidCraft stores 4x4 row-major; translation is m[0][3], m[1][3], m[2][3].
  return [
    m[0]?.[0] ?? 1, m[1]?.[0] ?? 0, m[2]?.[0] ?? 0, m[3]?.[0] ?? 0,
    m[0]?.[1] ?? 0, m[1]?.[1] ?? 1, m[2]?.[1] ?? 0, m[3]?.[1] ?? 0,
    m[0]?.[2] ?? 0, m[1]?.[2] ?? 0, m[2]?.[2] ?? 1, m[3]?.[2] ?? 0,
    (m[0]?.[3] ?? 0) * docScale,
    (m[1]?.[3] ?? 0) * docScale,
    (m[2]?.[3] ?? 0) * docScale,
    m[3]?.[3] ?? 1,
  ];
}

function multiplyColMajor(a: Matrix4Tuple, b: Matrix4Tuple): Matrix4Tuple {
  const out = new Array<number>(16).fill(0) as Matrix4Tuple;
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row]! * b[col * 4 + 0]! +
        a[1 * 4 + row]! * b[col * 4 + 1]! +
        a[2 * 4 + row]! * b[col * 4 + 2]! +
        a[3 * 4 + row]! * b[col * 4 + 3]!;
    }
  }
  return out;
}

export function parseSolidCraftBytes(bytes: Uint8Array, fileName?: string): Model3DDocument {
  const archive = unzipSync(bytes);
  const docBytes = archive['document.json'];
  if (!docBytes) {
    throw new Error('Invalid SolidCraft (.sc) file: missing document.json');
  }

  const doc = JSON.parse(strFromU8(docBytes)) as ScDocumentJson;
  const docScale = unitScale(doc.units ?? 'mm');

  // Resolve parameters in order (multi-pass in case a param references an earlier one).
  const params = new Map<string, number>();
  for (let pass = 0; pass < 3; pass++) {
    for (const p of doc.params ?? []) {
      try {
        const val = evaluateExpr(p.expr, params, unitScale(p.unit ?? doc.units ?? 'mm'));
        params.set(p.name, val);
      } catch {
        // Retry on next pass if dependent parameter wasn't resolved yet.
      }
    }
  }

  const componentsById = new Map<number, ScComponent>();
  const components: Model3DComponent[] = [];
  for (const c of doc.components ?? []) {
    componentsById.set(c.id, c);
    components.push({
      id: String(c.id),
      name: c.name,
      parentId: c.parent && c.parent !== 0 ? String(c.parent) : null,
    });
  }

  // Build world transform per component from occurrences.
  const occByComp = new Map<number, ScOccurrence>();
  for (const o of doc.occurrences ?? []) {
    if (!occByComp.has(o.component)) occByComp.set(o.component, o);
  }

  const worldTransformForComponent = (compId: number): Matrix4Tuple => {
    const chain: Matrix4Tuple[] = [];
    let currentComp: number | undefined = compId;
    const seen = new Set<number>();
    while (currentComp && currentComp !== 0 && !seen.has(currentComp)) {
      seen.add(currentComp);
      const occ = occByComp.get(currentComp);
      if (occ?.transform) {
        chain.unshift(rowMajorToColMajor(occ.transform, docScale));
      }
      const comp = componentsById.get(currentComp);
      currentComp = comp?.parent;
    }
    return chain.reduce((acc, m) => multiplyColMajor(acc, m), [...IDENTITY_MATRIX] as Matrix4Tuple);
  };

  const hiddenBodies = new Set(doc.visibility?.hidden_bodies ?? []);
  const hiddenOccurrences = new Set(doc.visibility?.hidden_occurrences ?? []);
  const appearances = doc.appearances?.bodies ?? {};

  const bodies: Model3DBody[] = [];
  for (const f of doc.features ?? []) {
    if (f.suppressed) continue;
    if (f.operation === 'cut') continue;
    if (f.type !== 'box') continue;

    const compId = f.component ?? 0;
    const comp = componentsById.get(compId);
    const occ = occByComp.get(compId);
    const componentName = comp?.name ?? 'Root';

    // SolidCraft box: corner [x, y, z], length (X), width (Y), height (Z).
    const rawCx = evaluateExpr(f.corner?.[0], params, docScale);
    const rawCy = evaluateExpr(f.corner?.[1], params, docScale);
    const rawCz = evaluateExpr(f.corner?.[2], params, docScale);
    const rawDx = evaluateExpr(f.length, params, docScale);
    const rawDy = evaluateExpr(f.width, params, docScale);
    const rawDz = evaluateExpr(f.height, params, docScale);

    const cx = rawDx < 0 ? rawCx + rawDx : rawCx;
    const cy = rawDy < 0 ? rawCy + rawDy : rawCy;
    const cz = rawDz < 0 ? rawCz + rawDz : rawCz;
    const dx = Math.abs(rawDx);
    const dy = Math.abs(rawDy);
    const dz = Math.abs(rawDz);

    if (dx <= 0 || dy <= 0 || dz <= 0) continue;

    const sorted = [dx, dy, dz].sort((a, b) => a - b) as [number, number, number];
    const bodyName = f.body_names?.[0] ?? f.name;
    const appearance = appearances[bodyName];
    const isOccHidden = occ ? hiddenOccurrences.has(occ.name) : false;

    bodies.push({
      id: `${f.id}:${bodyName}`,
      name: bodyName,
      componentId: String(compId),
      componentName,
      dimensionsMm: sorted,
      transform: worldTransformForComponent(compId),
      color: appearance?.color ?? null,
      opacity: appearance?.opacity ?? 1,
      hiddenInSource: hiddenBodies.has(bodyName) || isOccHidden,
      geometry: {
        kind: 'box',
        corner: [cx, cy, cz],
        size: [dx, dy, dz],
      },
    });
  }

  return {
    name: doc.name || fileName?.replace(/\.sc$/i, '') || '3D Model',
    units: doc.units ?? 'mm',
    components,
    bodies,
  };
}

export const scParser: Model3DParser = {
  id: 'solidcraft',
  extensions: ['.sc'],
  canParse(fileName: string, bytes: Uint8Array): boolean {
    if (!fileName.toLowerCase().endsWith('.sc')) return false;
    // Check ZIP magic header PK\x03\x04
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  },
  parse(bytes: Uint8Array, fileName?: string): Model3DDocument {
    return parseSolidCraftBytes(bytes, fileName);
  },
};
