// Where the app runs: a normal browser (PWA) or the CutList Mac app (Tauri).

/** True inside the Mac app, where Tauri provides native dialogs and printing. */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
