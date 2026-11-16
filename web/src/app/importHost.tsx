// The import dialogs on a phone are opened from the Projects tab but must outlive it: importing
// opens the new project, which leaves the Projects tab. So they are hosted once, at the top.
import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { ImportDialog } from './ImportDialog';

const Model3DImportModal = lazy(() =>
  import('../import3d/Model3DImportModal').then((m) => ({ default: m.Model3DImportModal })),
);

interface ImportFlag {
  open: boolean;
  show(): void;
  hide(): void;
}

export const useImportDialog = create<ImportFlag>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

interface Import3DFlag {
  open: boolean;
  initialFile: File | null;
  show(file?: File | null): void;
  hide(): void;
}

export const useImport3DDialog = create<Import3DFlag>()((set) => ({
  open: false,
  initialFile: null,
  show: (file = null) => set({ open: true, initialFile: file }),
  hide: () => set({ open: false, initialFile: null }),
}));

export function ImportHost() {
  const { open, hide } = useImportDialog();
  const import3d = useImport3DDialog();
  return (
    <>
      {open && createPortal(<ImportDialog onClose={hide} />, document.body)}
      {import3d.open &&
        createPortal(
          <Suspense fallback={null}>
            <Model3DImportModal initialFile={import3d.initialFile} onClose={import3d.hide} />
          </Suspense>,
          document.body,
        )}
    </>
  );
}
