// Saving a generated file: a native Save dialog in the Mac app, a normal download in a browser.
import { isDesktopApp } from './platform';

export interface FileKind {
  /** Shown in the Save dialog's format menu, e.g. "PDF". */
  name: string;
  extensions: string[];
}

/** Returns false when the user cancelled the Save dialog. */
export async function downloadBlob(
  blob: Blob,
  fileName: string,
  kind?: FileKind,
): Promise<boolean> {
  if (isDesktopApp()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({ defaultPath: fileName, filters: kind ? [kind] : undefined });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
