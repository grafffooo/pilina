import { useSyncExternalStore } from 'react';

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Re-renders every `ms` so relative times ("2 min ago") stay fresh. */
export function useNow(ms = 30_000): number {
  return useSyncExternalStore(
    (onChange) => {
      const t = setInterval(onChange, ms);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / ms) * ms,
  );
}
