import { scParser } from './scParser';
import type { Model3DDocument, Model3DParser } from './types';

export * from './types';
export * from './scParser';
export * from './thicknessGrouping';

const PARSERS: readonly Model3DParser[] = [scParser];

export function isSupported3DFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return PARSERS.some((p) => p.extensions.some((ext) => lower.endsWith(ext)));
}

export async function parse3DFile(file: File): Promise<Model3DDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parser = PARSERS.find((p) => p.canParse(file.name, bytes));
  if (!parser) {
    throw new Error(`Unsupported 3D model format: ${file.name}`);
  }
  return parser.parse(bytes, file.name);
}
