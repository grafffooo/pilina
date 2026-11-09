import { describe, expect, it } from 'vitest';
import { formatMetres, formatNumber, formatSquareMetres, formatMm } from './format';

describe('format', () => {
  it('rounds to two decimals and groups thousands', () => {
    expect(formatNumber(3181071.6666, 'en')).toBe('3,181,071.67');
  });

  it('uses the locale decimal separator', () => {
    expect(formatNumber(18.5, 'sk')).toBe('18,5');
  });

  it('converts long lengths to metres', () => {
    expect(formatMetres(16386, 'en')).toBe('16.4 m');
  });

  it('converts areas to square metres', () => {
    expect(formatSquareMetres(2800 * 914, 'en')).toBe('2.56 m²');
  });

  it('shows a dash for non-numbers', () => {
    expect(formatNumber(Number.NaN)).toBe('–');
  });
});

describe('formatMm', () => {
  it('never groups thousands', () => {
    expect(formatMm(2800)).toBe('2800');
    expect(formatMm(18.5)).toBe('18.5');
    expect(formatMm(1234.567, 'sk')).toBe('1234,57');
  });
});
