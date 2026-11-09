// In-app confirm and prompt dialogs. They replace window.confirm/prompt, which an app
// window (Tauri on macOS) doesn't show, and they match the app's look in the browser too.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import ui from './ui.module.css';
import styles from './dialogs.module.css';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deleting things. */
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  initial?: string;
}

type Request = { id: number } & (
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
);

let nextId = 1;

const useDialogs = create<{ queue: Request[] }>(() => ({ queue: [] }));

type NewRequest = Request extends infer R ? (R extends Request ? Omit<R, 'id'> : never) : never;
const push = (r: NewRequest) =>
  useDialogs.setState((s) => ({ queue: [...s.queue, { ...r, id: nextId++ } as Request] }));
const pop = () => useDialogs.setState((s) => ({ queue: s.queue.slice(1) }));

/** Asks a yes/no question; resolves true when confirmed. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => push({ kind: 'confirm', options, resolve }));
}

/** Asks for a line of text; resolves the trimmed text, or null when cancelled or empty. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => push({ kind: 'prompt', options, resolve }));
}

/** Renders the oldest open dialog. Mount once, near the root. */
export function DialogHost() {
  const current = useDialogs((s) => s.queue[0]);
  if (!current) return null;
  // A key per request resets the text field between prompts.
  return <Dialog key={current.id} request={current} />;
}

function Dialog({ request }: { request: Request }) {
  const { t } = useTranslation();
  const [text, setText] = useState(
    request.kind === 'prompt' ? (request.options.initial ?? '') : '',
  );
  const box = useRef<HTMLDivElement>(null);

  const finish = (ok: boolean) => {
    pop();
    if (request.kind === 'confirm') request.resolve(ok);
    else request.resolve(ok && text.trim() ? text.trim() : null);
  };

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, [data-autofocus]')?.focus();
  }, []);

  const o = request.options;
  const danger = request.kind === 'confirm' && request.options.danger;
  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => e.target === e.currentTarget && finish(false)}
    >
      <div
        ref={box}
        className={styles.dialog}
        role={request.kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') finish(false);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            finish(true);
          }}
        >
          <h2 id="dialog-title" className={styles.title}>
            {o.title}
          </h2>
          {request.kind === 'confirm' && request.options.message && (
            <p className={styles.message}>{request.options.message}</p>
          )}
          {request.kind === 'prompt' && (
            <label className={ui.field}>
              {request.options.label}
              <input
                className={ui.fieldInput}
                value={text}
                placeholder={request.options.placeholder}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          )}
          <div className={styles.actions}>
            {/* For destructive actions the safe choice gets the focus, so Return doesn't delete. */}
            <button
              type="button"
              className={ui.button}
              data-autofocus={danger || undefined}
              onClick={() => finish(false)}
            >
              {(request.kind === 'confirm' && request.options.cancelLabel) || t('Cancel')}
            </button>
            <button
              type="submit"
              data-autofocus={!danger || undefined}
              className={danger ? styles.danger : ui.buttonPrimary}
              disabled={request.kind === 'prompt' && !text.trim()}
            >
              {o.confirmLabel ?? t('OK')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
