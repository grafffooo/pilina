// Interface language. English text is the key (t('Add part')), so English needs no file
// except for plural forms; every other language has `<id>.json` mapping each key. Those files
// are loaded only when the language is chosen, so the app starts with English alone.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import { LANGUAGES, type Language, type LanguageInfo } from './languages';

export { LANGUAGES, type Language } from './languages';
export type LanguageChoice = Language | 'auto';

const KEY = 'cutlist.language';
const IDS = new Set<string>(LANGUAGES.map((l) => l.id));
const isLanguage = (v: string | null): v is Language => v !== null && IDS.has(v);

const files = import.meta.glob<Record<string, string>>(['./*.json', '!./en.json'], {
  import: 'default',
});

export function loadLanguageChoice(): LanguageChoice {
  try {
    const v = localStorage.getItem(KEY);
    return isLanguage(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Our language for a browser language tag (`de-AT` → German, `zh-TW` → Traditional Chinese). */
export function matchLanguage(tag: string): Language | null {
  const l = tag.toLowerCase();
  if (/^zh-(hant|tw|hk|mo)/.test(l)) return 'zh-Hant';
  if (l.startsWith('zh')) return 'zh-Hans';
  const base = l.split('-')[0]!;
  if (base === 'nb' || base === 'nn') return 'no';
  if (base === 'tl') return 'fil';
  if (base === 'hr' || base === 'bs' || base === 'sr') return base;
  return isLanguage(base) ? base : null;
}

/** The browser's first language we have, otherwise English. */
export function detectLanguage(): Language {
  const tags =
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const tag of tags) {
    const found = tag && matchLanguage(tag);
    if (found) return found;
  }
  return 'en';
}

export function resolveLanguage(choice: LanguageChoice): Language {
  return choice === 'auto' ? detectLanguage() : choice;
}

/** Loads a language's file (once) and switches to it. */
export async function switchLanguage(lng: Language): Promise<void> {
  if (lng !== 'en' && !i18n.hasResourceBundle(lng, 'translation')) {
    const load = files[`./${lng}.json`];
    if (load) i18n.addResourceBundle(lng, 'translation', await load());
  }
  await i18n.changeLanguage(lng);
}

export async function setLanguageChoice(choice: LanguageChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Applies for this session only.
  }
  await switchLanguage(resolveLanguage(choice));
}

/** Before the first render: the chosen language, so the app doesn't flash English. */
export async function startLanguage(): Promise<void> {
  try {
    await switchLanguage(resolveLanguage(loadLanguageChoice()));
  } catch (e) {
    console.error('Could not load the language, using English', e);
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  // Keys are English sentences, which contain dots and colons.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

const LIST: readonly LanguageInfo[] = LANGUAGES;
const info = (lng: string): LanguageInfo => LIST.find((l) => l.id === lng) ?? LIST[0]!;

function applyDocumentLanguage(lng: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lng;
  document.documentElement.dir = info(lng).rtl ? 'rtl' : 'ltr';
}
i18n.on('languageChanged', applyDocumentLanguage);
applyDocumentLanguage(i18n.language);

/** While a PDF is built in another language (see `inPrintLanguage`). */
let printing: { lng: Language; t: typeof i18n.t } | null = null;

/** Current language as a locale for number and date formatting (`sr` → `sr-Latn`). */
export function locale(): string {
  const l = info(printing?.lng ?? i18n.language);
  return l.intl ?? l.id;
}

/** The interface reads right to left (Arabic, Urdu). */
export const isRtl = () => !!info(i18n.language).rtl;

export const t = ((...args: Parameters<typeof i18n.t>) =>
  (printing?.t ?? i18n.t)(...args)) as typeof i18n.t;

/**
 * Scripts the PDF's font (Inter) can't draw: Chinese, Japanese, Korean, Thai, Devanagari,
 * Bengali and Arabic. pdf-lib places glyphs one by one without shaping, so even with a font
 * these would print wrong; their PDFs are in English (the app itself stays translated).
 */
const PDF_ENGLISH = new Set<string>([
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ko',
  'th',
  'hi',
  'bn',
  'ar',
  'ur',
]);

/** The language a PDF is written in. */
export const pdfLanguage = (): Language =>
  PDF_ENGLISH.has(i18n.language) ? 'en' : (i18n.language as Language);

/** Runs `fn` with t() and locale() in the PDF's language. */
export async function inPrintLanguage<T>(fn: () => Promise<T>): Promise<T> {
  const lng = pdfLanguage();
  if (lng === i18n.language) return fn();
  printing = { lng, t: i18n.getFixedT(lng) };
  try {
    return await fn();
  } finally {
    printing = null;
  }
}

export default i18n;
