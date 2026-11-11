import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import i18n, {
  LANGUAGES,
  inPrintLanguage,
  locale,
  matchLanguage,
  pdfLanguage,
  switchLanguage,
  t,
} from './index';
import { extractKeys, pluralForms } from './keys';
import type { LanguageInfo } from './languages';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [readFileSync(path, 'utf8')] : [];
  });
}

const here = new URL('.', import.meta.url).pathname;
const used = extractKeys(sources(new URL('..', import.meta.url).pathname));
const file = (id: string): Record<string, string> =>
  JSON.parse(readFileSync(join(here, `${id}.json`), 'utf8')) as Record<string, string>;
const others = (LANGUAGES as readonly LanguageInfo[]).filter((l) => l.id !== 'en');
const PLURAL = /_(zero|one|two|few|many|other)$/;

describe('translations', () => {
  it('finds the keys used in the code', () => {
    expect(used.length).toBeGreaterThan(300);
  });

  it('has a file for every language, and no file without a language', () => {
    const ids = readdirSync(here)
      .filter((n) => n.endsWith('.json') && n !== 'en.json')
      .map((n) => n.replace(/\.json$/, ''))
      .sort();
    expect(ids).toEqual(others.map((l) => l.id).sort());
  });

  describe.each(others)('$english ($id)', ({ id, intl }) => {
    const strings = file(id);
    const forms = pluralForms(intl ?? id);

    it('has every key, with all its plural forms', () => {
      const missing = used.flatMap(({ key, plural }) =>
        plural
          ? forms.map((f) => `${key}_${f}`).filter((k) => !(k in strings))
          : key in strings
            ? []
            : [key],
      );
      expect(missing).toEqual([]);
    });

    it('has no unused or empty strings', () => {
      const keys = new Set(used.map((k) => k.key));
      const bad = Object.entries(strings).filter(
        ([k, v]) => !keys.has(k.replace(PLURAL, '')) || v.trim() === '',
      );
      expect(bad).toEqual([]);
    });

    it('keeps every {{placeholder}} and adds none', () => {
      const bad = Object.entries(strings).filter(([key, value]) => {
        const base = key.replace(PLURAL, '');
        const source = en[`${base}_other` as keyof typeof en] ?? en[key as keyof typeof en] ?? base;
        const allowed = new Set(source.match(/\{\{\w+\}\}/g) ?? []);
        const need = new Set(allowed);
        const have = new Set(value.match(/\{\{\w+\}\}/g) ?? []);
        // Forms for exactly one (or two, or none) may spell the number out.
        if (/_(zero|one|two)$/.test(key)) need.delete('{{count}}');
        return [...need].some((p) => !have.has(p)) || [...have].some((p) => !allowed.has(p));
      });
      expect(bad).toEqual([]);
    });
  });

  it('en has singular and plural forms for every counted key', () => {
    const missing = used
      .filter((k) => k.plural)
      .flatMap(({ key }) => ['one', 'other'].map((f) => `${key}_${f}`).filter((k) => !(k in en)));
    expect(missing).toEqual([]);
  });

  it('loads a language when chosen and picks its plural forms', async () => {
    await switchLanguage('sk');
    expect([1, 3, 5].map((count) => i18n.t('n_sheets', { count }))).toEqual([
      '1 doska',
      '3 dosky',
      '5 dosiek',
    ]);
    await switchLanguage('cs');
    expect([1, 3, 5].map((count) => i18n.t('n_cuts', { count }))).toEqual([
      '1 řez',
      '3 řezy',
      '5 řezů',
    ]);
    expect(i18n.t('Cut order')).toBe('Pořadí řezů');
    await switchLanguage('en');
    expect([1, 2].map((count) => i18n.t('n_sheets', { count }))).toEqual(['1 sheet', '2 sheets']);
    expect(i18n.t('Cut order')).toBe('Cut order');
  });

  it('picks the right form in languages with many plural forms', async () => {
    const sheets = (n: number) => i18n.t('n_sheets', { count: n });
    await switchLanguage('pl');
    expect([1, 3, 5, 22].map(sheets)).toEqual(['1 płyta', '3 płyty', '5 płyt', '22 płyty']);
    await switchLanguage('sl');
    expect([1, 2, 3, 5].map(sheets)).toEqual(['1 plošča', '2 plošči', '3 plošče', '5 plošč']);
    await switchLanguage('ar');
    expect([0, 1, 2, 3, 11, 100].map(sheets)).toEqual([
      'لا ألواح',
      'لوح واحد',
      'لوحان',
      '3 ألواح',
      '11 لوحًا',
      '100 لوح',
    ]);
    await switchLanguage('en');
  });

  it('writes PDFs in English where the PDF font lacks the script', async () => {
    await switchLanguage('ja');
    expect(pdfLanguage()).toBe('en');
    expect(await inPrintLanguage(async () => [t('Cut order'), locale()])).toEqual([
      'Cut order',
      'en',
    ]);
    expect(t('Cut order')).toBe('切断順序');
    await switchLanguage('de');
    expect(pdfLanguage()).toBe('de');
    await switchLanguage('en');
  });

  it('matches browser languages', () => {
    expect(['de-AT', 'zh-TW', 'zh-CN', 'nb-NO', 'pt-BR', 'xx'].map(matchLanguage)).toEqual([
      'de',
      'zh-Hant',
      'zh-Hans',
      'no',
      'pt',
      null,
    ]);
  });
});
