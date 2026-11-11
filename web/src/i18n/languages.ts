// The interface languages: the 44 of the old CutList app. `name` is how the language calls
// itself (shown in the picker), `english` its English name. `intl` is the locale used for
// numbers and dates when it differs from the id.
export const LANGUAGES = [
  { id: 'en', name: 'English', english: 'English' },
  { id: 'sk', name: 'Slovenčina', english: 'Slovak' },
  { id: 'cs', name: 'Čeština', english: 'Czech' },
  { id: 'de', name: 'Deutsch', english: 'German' },
  { id: 'fr', name: 'Français', english: 'French' },
  { id: 'it', name: 'Italiano', english: 'Italian' },
  { id: 'es', name: 'Español', english: 'Spanish' },
  { id: 'pt', name: 'Português', english: 'Portuguese' },
  { id: 'nl', name: 'Nederlands', english: 'Dutch' },
  { id: 'pl', name: 'Polski', english: 'Polish' },
  { id: 'hu', name: 'Magyar', english: 'Hungarian' },
  { id: 'ro', name: 'Română', english: 'Romanian' },
  { id: 'bg', name: 'Български', english: 'Bulgarian' },
  { id: 'el', name: 'Ελληνικά', english: 'Greek' },
  { id: 'sv', name: 'Svenska', english: 'Swedish' },
  { id: 'da', name: 'Dansk', english: 'Danish' },
  { id: 'fi', name: 'Suomi', english: 'Finnish' },
  { id: 'no', name: 'Norsk', english: 'Norwegian', intl: 'nb' },
  { id: 'is', name: 'Íslenska', english: 'Icelandic' },
  { id: 'et', name: 'Eesti', english: 'Estonian' },
  { id: 'lv', name: 'Latviešu', english: 'Latvian' },
  { id: 'lt', name: 'Lietuvių', english: 'Lithuanian' },
  { id: 'hr', name: 'Hrvatski', english: 'Croatian' },
  { id: 'sl', name: 'Slovenščina', english: 'Slovenian' },
  { id: 'sr', name: 'Srpski', english: 'Serbian', intl: 'sr-Latn' },
  { id: 'bs', name: 'Bosanski', english: 'Bosnian' },
  { id: 'sq', name: 'Shqip', english: 'Albanian' },
  { id: 'uk', name: 'Українська', english: 'Ukrainian' },
  { id: 'tr', name: 'Türkçe', english: 'Turkish' },
  { id: 'ga', name: 'Gaeilge', english: 'Irish' },
  { id: 'mt', name: 'Malti', english: 'Maltese' },
  { id: 'eu', name: 'Euskara', english: 'Basque' },
  { id: 'zh-Hans', name: '简体中文', english: 'Chinese (Simplified)' },
  { id: 'zh-Hant', name: '繁體中文', english: 'Chinese (Traditional)' },
  { id: 'ja', name: '日本語', english: 'Japanese' },
  { id: 'ko', name: '한국어', english: 'Korean' },
  { id: 'vi', name: 'Tiếng Việt', english: 'Vietnamese' },
  { id: 'id', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { id: 'fil', name: 'Filipino', english: 'Filipino' },
  { id: 'th', name: 'ไทย', english: 'Thai' },
  { id: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { id: 'bn', name: 'বাংলা', english: 'Bengali' },
  { id: 'ar', name: 'العربية', english: 'Arabic', rtl: true },
  { id: 'ur', name: 'اردو', english: 'Urdu', rtl: true },
] as const satisfies readonly {
  id: string;
  name: string;
  english: string;
  intl?: string;
  rtl?: boolean;
}[];

export type Language = (typeof LANGUAGES)[number]['id'];

export interface LanguageInfo {
  id: Language;
  name: string;
  english: string;
  intl?: string;
  rtl?: boolean;
}
