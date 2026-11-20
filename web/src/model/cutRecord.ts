// A sheet or bar marked as cut in cut mode. Statistics (milestone 5) are built from these.

export type CutRecordKind = 'sheet' | 'linear';

export interface CutRecord {
  id: string;
  at: number;
  projectId: string;
  projectName: string;
  /** Sheet panel vs 1D bar. Missing on older records means 'sheet'. */
  kind?: CutRecordKind;
  materialId: string | null;
  materialName: string;
  /** mm (sheet length or bar length) */
  sheetLength: number;
  /** mm (0 for linear records) */
  sheetWidth: number;
  /** mm² covered by parts (0 for linear records). */
  usedArea: number;
  /** mm² of leftovers kept in the library from this sheet (0 for linear records). */
  keptArea: number;
  /** mm covered by parts (linear records). */
  usedLength?: number;
  /** mm of leftovers kept in the library from this bar (linear records). */
  keptLength?: number;
  /** The sheet or bar was a library offcut (then its `offcutCode` is set). */
  fromOffcut: boolean;
  offcutCode: string | null;
  /** Price of this sheet or bar in `currency`, when known. */
  cost: number | null;
  currency: string;
}

/** Whether a cut record is for a sheet or linear bar, defaulting older records to 'sheet'. */
export function cutRecordKind(r: Pick<CutRecord, 'kind'> | undefined | null): CutRecordKind {
  return r?.kind ?? 'sheet';
}
