// A sheet marked as cut in cut mode. Statistics (milestone 5) are built from these.

export interface CutRecord {
  id: string;
  at: number;
  projectId: string;
  projectName: string;
  materialId: string | null;
  materialName: string;
  /** mm */
  sheetLength: number;
  sheetWidth: number;
  /** mm² covered by parts. */
  usedArea: number;
  /** mm² of leftovers kept in the library from this sheet. */
  keptArea: number;
  /** The sheet was a library offcut (then its `offcutCode` is set). */
  fromOffcut: boolean;
  offcutCode: string | null;
  /** Price of this sheet in `currency`, when known. */
  cost: number | null;
  currency: string;
}
