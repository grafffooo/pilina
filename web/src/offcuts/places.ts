import { useMemo } from 'react';
import { useStore } from '../store/store';

/** Places to offer: the saved ones, then any other place an offcut is stored in. */
export function usePlaces(): string[] {
  const saved = useStore((s) => s.settings.locations);
  const offcuts = useStore((s) => s.offcuts);
  return useMemo(() => {
    const seen = new Set(saved.map((l) => l.toLowerCase()));
    const extra = [...new Set(offcuts.map((o) => o.location.trim()).filter(Boolean))]
      .filter((l) => !seen.has(l.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    return [...saved, ...extra];
  }, [saved, offcuts]);
}
