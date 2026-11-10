import { describe, expect, it } from 'vitest';
import { formatNumber } from './format';

describe('format', () => {
  it('rounds to two decimals and groups thousands', () => {
    expect(formatNumber(3181071.6666, 'en')).toBe('3,181,071.67');
  });

  it('uses the locale decimal separator', () => {
    expect(formatNumber(18.5, 'sk')).toBe('18,5');
  });

  it('shows a dash for non-numbers', () => {
    expect(formatNumber(Number.NaN)).toBe('–');
  });
});
