import { describe, expect, it } from 'vitest';
import {
  areaPriceIn,
  areaPriceOut,
  formatArea,
  formatLength,
  formatLong,
  longPriceIn,
  longPriceOut,
  parseLength,
} from './units';

describe('showing sizes', () => {
  it('keeps millimetres and centimetres plain', () => {
    expect(formatLength(2800, 'mm', 'en')).toBe('2800');
    expect(formatLength(18.5, 'mm', 'sk')).toBe('18,5');
    expect(formatLength(724, 'cm', 'en')).toBe('72.4');
  });

  it('shows inches as reduced fractions, to 1/32', () => {
    expect(formatLength(25.4 * 23.625, 'in')).toBe('23 5/8');
    expect(formatLength(25.4 * 0.75, 'in')).toBe('3/4');
    expect(formatLength(25.4 * 48, 'in')).toBe('48');
    expect(formatLength(4, 'in')).toBe('5/32'); // a 4 mm kerf
    expect(formatLength(600, 'in')).toBe('23 5/8'); // 23.622″ rounds to the nearest 1/32
  });

  it('switches long lengths and areas to feet', () => {
    expect(formatLong(16386, 'mm', 'en')).toBe('16.4 m');
    expect(formatLong(3048, 'in', 'en')).toBe('10 ft');
    expect(formatArea(2_559_200, 'cm', 'en')).toBe('2.56 m²');
    expect(formatArea(92_903.04, 'in', 'en')).toBe('1 ft²');
  });
});

describe('typing sizes', () => {
  it('reads numbers in the current unit', () => {
    expect(parseLength('720', 'mm')).toBe(720);
    expect(parseLength('18,5', 'mm')).toBe(18.5);
    expect(parseLength('2 800', 'mm')).toBe(2800);
    expect(parseLength('1,234.5', 'mm')).toBe(1234.5);
    expect(parseLength('72.4', 'cm')).toBeCloseTo(724);
    expect(parseLength('23.625', 'in')).toBeCloseTo(600.075);
  });

  it('reads inch fractions', () => {
    expect(parseLength('23 5/8', 'in')).toBeCloseTo(600.075);
    expect(parseLength('23-5/8', 'in')).toBeCloseTo(600.075);
    expect(parseLength('3/4', 'in')).toBeCloseTo(19.05);
    expect(parseLength('23 5/8"', 'in')).toBeCloseTo(600.075);
    expect(parseLength('2\' 3 1/2"', 'mm')).toBeCloseTo(698.5);
    expect(parseLength("4'", 'in')).toBeCloseTo(1219.2);
  });

  it('lets a typed unit override the setting', () => {
    expect(parseLength('600mm', 'in')).toBe(600);
    expect(parseLength('60 cm', 'mm')).toBe(600);
    expect(parseLength('1.2m', 'in')).toBe(1200);
    expect(parseLength('3/4in', 'mm')).toBeCloseTo(19.05);
  });

  it('rejects what is not a size yet', () => {
    for (const text of ['', ' ', '23 5/', '5/0', 'abc', '23 5', '-']) {
      expect(parseLength(text, 'in')).toBeNull();
    }
  });

  it('round-trips what it shows', () => {
    for (const mm of [3, 19.05, 600.075, 1219.2, 2440]) {
      const shown = formatLength(mm, 'in');
      expect(formatLength(parseLength(shown, 'in')!, 'in')).toBe(shown);
    }
  });
});

describe('prices in feet', () => {
  it('converts per m² and per metre both ways', () => {
    expect(areaPriceOut(10, 'in')).toBeCloseTo(0.929);
    expect(areaPriceIn(areaPriceOut(37.5, 'in'), 'in')).toBeCloseTo(37.5);
    expect(longPriceOut(1, 'in')).toBeCloseTo(0.3048);
    expect(longPriceIn(longPriceOut(0.8, 'in'), 'in')).toBeCloseTo(0.8);
    expect(areaPriceOut(10, 'cm')).toBe(10);
  });
});
