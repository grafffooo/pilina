// The phone's (or the Mac's) share sheet, where the browser offers it for files.

export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files });
  } catch {
    return false;
  }
}

/** Opens the share sheet. False when it was closed without sharing. */
export async function shareFiles(files: File[], title: string): Promise<boolean> {
  try {
    await navigator.share({ files, title });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}
