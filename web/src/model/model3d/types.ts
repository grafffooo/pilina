/**
 * Format-agnostic intermediate representation for 3D models imported into Pilina.
 * Additional 3D parsers (e.g. .3mf, .obj, .step) can implement `Model3DParser`.
 */

export type Matrix4Tuple = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export interface Model3DComponent {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Model3DBodyGeometry {
  /** Box dimensions in mm before transform, or bounding box size. */
  kind: 'box';
  /** Origin corner [x, y, z] in local component space (mm). */
  corner: [number, number, number];
  /** Axis-aligned sizes [dx, dy, dz] in local component space (mm). */
  size: [number, number, number];
}

export interface Model3DBody {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  /** Sorted dimensions in mm: [thickness, width, length] where thickness <= width <= length. */
  dimensionsMm: [number, number, number];
  /** World transform (column-major 4x4) in mm. */
  transform: Matrix4Tuple;
  /** RGB 0-255 colour from source appearance, or null if default. */
  color: [number, number, number] | null;
  /** Opacity 0-1 from source appearance. */
  opacity: number;
  /** Whether the body was marked hidden in the source file. */
  hiddenInSource: boolean;
  geometry: Model3DBodyGeometry;
}

export interface Model3DDocument {
  name: string;
  units: string;
  components: Model3DComponent[];
  bodies: Model3DBody[];
}

export interface Model3DParser {
  readonly id: string;
  readonly extensions: readonly string[];
  canParse(fileName: string, bytes: Uint8Array): boolean;
  parse(bytes: Uint8Array, fileName?: string): Promise<Model3DDocument> | Model3DDocument;
}
