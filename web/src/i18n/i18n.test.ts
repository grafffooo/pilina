import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import cs from './cs.json';
import en from './en.json';
import i18n from './index';
import { extractKeys, PLURAL_FORMS } from './keys';
import sk from './sk.json';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [readFileSync(path, 'utf8')] : [];
  });
}

const used = extractKeys(sources(new URL('..', import.meta.url).pathname));
const files: Record<'en' | 'sk' | 'cs', Record<string, string>> = { en, sk, cs };

describe('translations', () => {
  it('finds the keys used in the code', () => {
    expect(used.length).toBeGreaterThan(300);
  });

  for (const lang of ['sk', 'cs'] as const) {
    it(`${lang} has every key, with all plural forms`, () => {
      const missing = used.flatMap(({ key, plural }) =>
        plural
          ? PLURAL_FORMS[lang].map((f) => `${key}_${f}`).filter((k) => !(k in files[lang]))
          : key in files[lang]
            ? []
            : [key],
      );
      expect(missing).toEqual([]);
    });

    it(`${lang} keeps every {{placeholder}}`, () => {
      const bad = Object.entries(files[lang]).filter(([key, value]) => {
        const base = key.replace(/_(one|few|many|other)$/, '');
        const source = en[key as keyof typeof en] ?? base;
        const need = new Set(source.match(/\{\{\w+\}\}/g) ?? []);
        // The singular form may spell out "1" instead of {{count}}.
        if (key.endsWith('_one')) need.delete('{{count}}');
        return [...need].some((p) => !value.includes(p));
      });
      expect(bad).toEqual([]);
    });
  }

  it('en has singular and plural forms for every counted key', () => {
    const missing = used
      .filter((k) => k.plural)
      .flatMap(({ key }) => PLURAL_FORMS.en.map((f) => `${key}_${f}`).filter((k) => !(k in en)));
    expect(missing).toEqual([]);
  });

  it('has no unused translations', () => {
    const keys = new Set(used.map((k) => k.key));
    const unused = Object.keys(sk).filter(
      (k) => !keys.has(k.replace(/_(one|few|many|other)$/, '')),
    );
    expect(unused).toEqual([]);
  });

  it('chooses Slovak and Czech plural forms', async () => {
    await i18n.changeLanguage('sk');
    expect([1, 3, 5].map((count) => i18n.t('n_sheets', { count }))).toEqual([
      '1 doska',
      '3 dosky',
      '5 dosiek',
    ]);
    await i18n.changeLanguage('cs');
    expect([1, 3, 5].map((count) => i18n.t('n_cuts', { count }))).toEqual([
      '1 řez',
      '3 řezy',
      '5 řezů',
    ]);
    expect(i18n.t('Cut order')).toBe('Pořadí řezů');
    await i18n.changeLanguage('en');
    expect([1, 2].map((count) => i18n.t('n_sheets', { count }))).toEqual(['1 sheet', '2 sheets']);
    expect(i18n.t('Cut order')).toBe('Cut order');
  });
});
