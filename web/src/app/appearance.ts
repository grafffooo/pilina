// Theme and accent, stored per device and applied as attributes on <html>.

export type Theme = 'system' | 'light' | 'dark';
export type Accent = 'seafoam' | 'moss';

export interface Appearance {
  theme: Theme;
  accent: Accent;
}

const KEY = 'cutlist.appearance';
const DEFAULT: Appearance = { theme: 'system', accent: 'seafoam' };

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Appearance>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  if (a.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', a.theme);
  root.setAttribute('data-accent', a.accent);
}

export function saveAppearance(a: Appearance) {
  applyAppearance(a);
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // Not stored in private mode; still applied for this session.
  }
}
