// Theme, stored per device and applied as an attribute on <html>.

export type Theme = 'system' | 'light' | 'dark';

export interface Appearance {
  theme: Theme;
}

const KEY = 'cutlist.appearance';
const DEFAULT: Appearance = { theme: 'system' };

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Appearance>) : {};
    return { theme: saved.theme ?? DEFAULT.theme };
  } catch {
    return DEFAULT;
  }
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  if (a.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', a.theme);
  // Older versions also chose an accent colour; there is one accent now.
  root.removeAttribute('data-accent');
}

export function saveAppearance(a: Appearance) {
  applyAppearance(a);
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // Not stored in private mode; still applied for this session.
  }
}
