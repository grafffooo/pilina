// A project carried in a link: the project file, compressed, in the part after "#", so it
// never reaches a server. Opening the link offers to add the project. Small projects fit in
// a QR code too.
import { isProjectFile, type ProjectFile } from './importExport';

const PREFIX = '#import=';
/** Longest link put in a QR code. Codes hold more, but denser ones are hard for a phone
 *  camera to read off a screen. */
export const QR_MAX = 1200;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The file with every id inside the project (not the project's own) passed through `map`. */
function remapIds(file: ProjectFile, map: (id: string) => string): ProjectFile {
  const opt = (id: string | null) => (id === null ? null : map(id));
  const p = file.project;
  return {
    ...file,
    materials: file.materials.map((m) => ({ ...m, id: map(m.id) })),
    edgeBands: file.edgeBands.map((b) => ({ ...b, id: map(b.id) })),
    project: {
      ...p,
      parts: p.parts.map((x) => ({
        ...x,
        id: map(x.id),
        materialId: opt(x.materialId),
        edgeBandId: opt(x.edgeBandId),
      })),
      stock: p.stock.map((x) => ({ ...x, id: map(x.id), materialId: opt(x.materialId) })),
      defaultEdgeBandId: opt(p.defaultEdgeBandId),
      pricing: {
        ...p.pricing,
        extras: p.pricing.extras.map((x) => ({ ...x, id: map(x.id) })),
      },
    },
  };
}

/** Same id in, same id out; a new one per distinct id. */
function renamer(next: () => string) {
  const ids = new Map<string, string>();
  return (id: string) => {
    if (!ids.has(id)) ids.set(id, next());
    return ids.get(id)!;
  };
}

/**
 * The project file without what the receiver recalculates anyway, and with short ids:
 * random ids don't compress and would make up most of the link. Reading the link gives
 * them fresh random ids again, so materials are then matched by name.
 */
function slim(file: ProjectFile): ProjectFile {
  let n = 0;
  const short = remapIds(
    file,
    renamer(() => (n++).toString(36)),
  );
  return { ...short, project: { ...short.project, summary: null } };
}

export async function projectLink(file: ProjectFile, base: string): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(slim(file)));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return `${base.replace(/#.*$/, '')}${PREFIX}${toBase64Url(packed)}`;
}

/** The project file in a link's hash, `null` when there is none; throws when it's damaged. */
export async function readProjectLink(hash: string): Promise<ProjectFile | null> {
  if (!hash.startsWith(PREFIX)) return null;
  const packed = fromBase64Url(hash.slice(PREFIX.length));
  const json = new TextDecoder().decode(await pipe(packed, new DecompressionStream('deflate-raw')));
  const data: unknown = JSON.parse(json);
  if (!isProjectFile(data)) throw new Error('Not a Pilina project');
  return remapIds(
    data,
    renamer(() => crypto.randomUUID()),
  );
}

/**
 * Where links should point: the address this app is published at (VITE_PUBLIC_URL), or the
 * address it is running at in a browser. `null` in the Mac app without a published address.
 */
export function linkBase(): string | null {
  const configured = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  if (configured) return configured;
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  if ('__TAURI_INTERNALS__' in window) return null;
  return `${location.origin}${location.pathname}`;
}

/** True when the link would only work on this computer. */
export const isLocalAddress = (url: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.local)(:|\/)/.test(url);
