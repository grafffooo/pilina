// A sheet or a task screen on a phone is a layer in the browser's history: the Back button (or the
// back swipe) closes it instead of leaving the app, and closing it by hand drops its entry again.
import { useEffect, useRef } from 'react';

let seq = 0;

const onPhone = () => window.matchMedia('(max-width: 767px)').matches;

export function useHistoryLayer(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open || !onPhone()) return;
    const id = ++seq;
    let pushed = false;
    let popped = false;
    const onPop = () => {
      // Back removed this layer's entry (the current entry is no longer ours).
      if ((history.state as { pilinaLayer?: number } | null)?.pilinaLayer !== id) {
        popped = true;
        close.current();
      }
    };
    // A tick later, so React's double run of effects in development doesn't push and pop twice.
    const timer = setTimeout(() => {
      pushed = true;
      history.pushState({ ...(history.state as object | null), pilinaLayer: id }, '');
      window.addEventListener('popstate', onPop);
    }, 0);
    return () => {
      clearTimeout(timer);
      if (!pushed) return;
      window.removeEventListener('popstate', onPop);
      // Closed by the app (a button, or after saving): remove the entry we added.
      if (!popped && (history.state as { pilinaLayer?: number } | null)?.pilinaLayer === id) {
        history.back();
      }
    };
  }, [open]);
}
