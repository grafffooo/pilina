// The import dialog on a phone is opened from the Projects tab but must outlive it: importing opens
// the new project, which leaves the Projects tab. So it is hosted once, at the top of the phone app.
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { ImportDialog } from './ImportDialog';

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

export function ImportHost() {
  const { open, hide } = useImportDialog();
  return open ? createPortal(<ImportDialog onClose={hide} />, document.body) : null;
}
