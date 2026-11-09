// Interface language: English, Slovak, Czech. English text is the key (t('Add part')), so
// English needs no file except for plural forms; sk.json and cs.json map each key.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cs from './cs.json';
import en from './en.json';
import sk from './sk.json';

export type Language = 'en' | 'sk' | 'cs';
export type LanguageChoice = Language | 'auto';

export const LANGUAGES: { id: Language; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'sk', name: 'Slovenčina' },
  { id: 'cs', name: 'Čeština' },
];

const KEY = 'cutlist.language';

export function loadLanguageChoice(): LanguageChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'sk' || v === 'cs' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** The browser's language if we have it, otherwise English. */
export function detectLanguage(): Language {
  const langs =
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'sk' || base === 'cs' || base === 'en') return base;
  }
  return 'en';
}

export function resolveLanguage(choice: LanguageChoice): Language {
  return choice === 'auto' ? detectLanguage() : choice;
}

export function setLanguageChoice(choice: LanguageChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Applies for this session only.
  }
  void i18n.changeLanguage(resolveLanguage(choice));
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sk: { translation: sk }, cs: { translation: cs } },
  lng: resolveLanguage(loadLanguageChoice()),
  fallbackLng: 'en',
  // Keys are English sentences, which contain dots and colons.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});
if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

/** Current language, for number and date formatting. */
export function locale(): Language {
  return (i18n.language as Language) || 'en';
}

export const t = i18n.t.bind(i18n);
export default i18n;
