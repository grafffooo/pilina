// Adds translations to every language file in src/i18n.
//
//   node scripts/add-translations.mjs scripts/translations/stage2.json
//
// The JSON is { "keys": ["English text", …], "languages": { "sk": ["…", …], … } }: each language lists
// its translations in the same order as `keys`. Existing keys are overwritten. Every language in
// src/i18n/languages.ts must be listed, so none is forgotten (i18n.test.ts checks the result).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'src', 'i18n');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/add-translations.mjs <translations.json>');
  process.exit(1);
}
const { keys, languages } = JSON.parse(readFileSync(file, 'utf8'));

const ids = [...readFileSync(join(dir, 'languages.ts'), 'utf8').matchAll(/id: '([^']+)'/g)]
  .map((m) => m[1])
  .filter((id) => id !== 'en');
const missing = ids.filter((id) => !(id in languages));
const extra = Object.keys(languages).filter((id) => !ids.includes(id));
if (missing.length || extra.length) {
  console.error(
    'Missing languages:',
    missing.join(' ') || '-',
    '| unknown:',
    extra.join(' ') || '-',
  );
  process.exit(1);
}
for (const [id, values] of Object.entries(languages)) {
  if (values.length !== keys.length) {
    console.error(`${id}: ${values.length} translations for ${keys.length} keys`);
    process.exit(1);
  }
}
for (const id of ids) {
  const path = join(dir, `${id}.json`);
  const strings = JSON.parse(readFileSync(path, 'utf8'));
  keys.forEach((key, i) => {
    strings[key] = languages[id][i];
  });
  writeFileSync(path, JSON.stringify(strings, null, 2) + '\n');
}
console.log(`Added ${keys.length} keys to ${ids.length} languages.`);
