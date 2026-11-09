// Finds every translation key used in the source (for the completeness test).
// Keys are single-quoted string literals passed to t(), tr() or i18nT().

export interface UsedKey {
  key: string;
  /** Called with a `count`, so it needs plural forms. */
  plural: boolean;
}

const CALL = /\b(?:t|tr|i18nT)\(\s*\n?\s*'((?:[^'\\]|\\.)*)'(\s*,\s*\{[^}]*\})?/g;

export function extractKeys(sources: string[]): UsedKey[] {
  const found = new Map<string, boolean>();
  for (const src of sources) {
    for (const m of src.matchAll(CALL)) {
      const key = m[1]!.replace(/\\'/g, "'");
      const plural = /\bcount\b/.test(m[2] ?? '');
      found.set(key, (found.get(key) ?? false) || plural);
    }
  }
  return [...found]
    .map(([key, plural]) => ({ key, plural }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Plural keys written as identifiers (n_sheets) need English forms too; sentence keys don't. */
export const isIdKey = (key: string) => /^[a-z0-9_]+$/.test(key);

export const PLURAL_FORMS: Record<'en' | 'sk' | 'cs', string[]> = {
  en: ['one', 'other'],
  // Slovak and Czech: 1 / 2–4 / decimals / 5+.
  sk: ['one', 'few', 'many', 'other'],
  cs: ['one', 'few', 'many', 'other'],
};
