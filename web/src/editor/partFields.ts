// Small helpers the parts table and the phone cards share.
import type { Grain } from '../engine/types';
import { t as i18nT } from '../i18n';

export const GRAIN_NEXT: Record<Grain, Grain> = { none: 'length', length: 'width', width: 'none' };

export const grainText = (g: Grain) =>
  g === 'none' ? i18nT('Any') : g === 'length' ? i18nT('Length') : i18nT('Width');

export const grainHelp = (g: Grain) =>
  g === 'none'
    ? i18nT('Grain: any direction (the part may be rotated)')
    : g === 'length'
      ? i18nT('Grain: along the sheet length')
      : i18nT('Grain: across the sheet (along its width)');

/** Moves focus to the same column in another row (Enter / Shift+Enter). */
export function focusCell(table: HTMLElement | null, row: number, col: string) {
  table?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`)?.focus();
}
