// Everything for getting a project to someone (or to another device): the project file, the
// cutting plan PDF, a Markdown file for the old CutList app, and a link with a QR code.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../lib/download';
import { canShareFiles, shareFiles } from '../lib/share';
import { exportProjectFile, fileSlug, projectToOldMarkdown } from '../model/importExport';
import type { Project } from '../model/project';
import { isLocalAddress, linkBase, projectLink, QR_MAX } from '../model/shareLink';
import { QrCode } from '../offcuts/QrCode';
import { useStore } from '../store/store';
import { CloseIcon, FileIcon, LinkIcon, SheetIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import styles from './ShareDialog.module.css';

function projectFile(project: Project): File {
  const { materials, edgeBands } = useStore.getState();
  const data = exportProjectFile(project, materials, edgeBands);
  return new File([JSON.stringify(data, null, 2)], `${fileSlug(project.name)}.pilina.json`, {
    type: 'application/json',
  });
}

export function ShareDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const plan = useStore((s) => s.result.plan);
  const job = useStore((s) => s.result.job);
  const ready = useStore((s) => s.result.status === 'ready');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const base = linkBase();
  const name = project.name || t('Untitled project');
  const sample = new File(['x'], 'x.json', { type: 'application/json' });
  const canShare = canShareFiles([sample]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    if (!base) return;
    const { materials, edgeBands } = useStore.getState();
    let live = true;
    projectLink(exportProjectFile(project, materials, edgeBands), base)
      .then((l) => live && setLink(l))
      .catch((e: unknown) => console.error('Could not make the link', e));
    return () => {
      live = false;
    };
  }, [project, base]);

  /** Runs an action, showing a short note if it fails. */
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      console.error(e);
      setMessage(t('That didn’t work. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const pdf = async () => {
    const { makePdf } = await import('../pdf/exportPdf');
    const { cost, materials, settings } = useStore.getState();
    return makePdf({
      project,
      plan: plan!,
      job: job!,
      cost,
      materials,
      currency: settings.currency,
      edgeAllowance: settings.edgeAllowance,
      cutMeasure: settings.cutMeasure,
    });
  };
  const pdfReady = ready && !!plan && !!job && plan.sheets.length > 0;

  const markdown = () => {
    const md = projectToOldMarkdown(project, useStore.getState().materials);
    return new File([md], `${fileSlug(project.name)}.md`, { type: 'text/markdown' });
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-h"
      >
        <div className={styles.head}>
          <h2 id="share-h">{t('Share “{{name}}”', { name })}</h2>
          <button type="button" className={ui.iconButton} aria-label={t('Close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <Row
          icon={<FileIcon />}
          title={t('Project file')}
          text={t('For Pilina on another device. Includes the materials and prices it uses.')}
        >
          {canShare && (
            <button
              type="button"
              className={ui.buttonPrimary}
              disabled={busy !== null}
              onClick={() => void run('file', () => shareFiles([projectFile(project)], name))}
            >
              {t('Share…')}
            </button>
          )}
          <button
            type="button"
            className={ui.button}
            disabled={busy !== null}
            onClick={() =>
              void run('file', () => {
                const f = projectFile(project);
                return downloadBlob(f, f.name, {
                  name: t('Pilina project'),
                  extensions: ['json'],
                });
              })
            }
          >
            {t('Save file')}
          </button>
        </Row>

        <Row
          icon={<SheetIcon />}
          title={t('Cutting plan (PDF)')}
          text={
            pdfReady
              ? t('To print, or to send to someone without Pilina.')
              : t('Available once the plan is up to date')
          }
        >
          {canShare && (
            <button
              type="button"
              className={ui.button}
              disabled={!pdfReady || busy !== null}
              onClick={() => void run('pdf', async () => shareFiles([await pdf()], name))}
            >
              {busy === 'pdf' ? t('Preparing PDF…') : t('Share…')}
            </button>
          )}
          <button
            type="button"
            className={ui.button}
            disabled={!pdfReady || busy !== null}
            onClick={() =>
              void run('pdf', async () => {
                const f = await pdf();
                return downloadBlob(f, f.name, { name: 'PDF', extensions: ['pdf'] });
              })
            }
          >
            {busy === 'pdf' && !canShare ? t('Preparing PDF…') : t('Save PDF')}
          </button>
        </Row>

        <Row
          icon={<FileIcon />}
          title={t('For the old CutList app')}
          text={t('A .md file with the parts and stock sheets, in millimetres. Prices stay out.')}
        >
          <button
            type="button"
            className={ui.button}
            disabled={busy !== null}
            onClick={() =>
              void run('md', () => {
                const f = markdown();
                return downloadBlob(f, f.name, { name: 'Markdown', extensions: ['md'] });
              })
            }
          >
            {t('Save .md')}
          </button>
        </Row>

        <Row
          icon={<LinkIcon />}
          title={t('Link')}
          text={
            !base
              ? t('Links need Pilina published on the web. Send the project file instead.')
              : t('The whole project is inside the link. Opening it offers to add the project.')
          }
        >
          {base && (
            <button
              type="button"
              className={ui.button}
              disabled={!link}
              onClick={() =>
                void run('link', async () => {
                  await navigator.clipboard.writeText(link!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? t('Copied') : t('Copy link')}
            </button>
          )}
        </Row>
        {base && link && (
          <div className={styles.linkBox}>
            {link.length <= QR_MAX ? (
              <QrCode text={link} size="168px" />
            ) : (
              <p className={styles.note}>{t('Too big for a QR code. Send the link instead.')}</p>
            )}
            {isLocalAddress(link) && (
              <p className={styles.warn}>
                {t(
                  'This link points to this computer, so it only opens here. Once Pilina is published on the web, links open anywhere.',
                )}
              </p>
            )}
          </div>
        )}

        {message && (
          <p className={styles.warn} role="alert">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.row}>
      <span className={styles.icon}>{icon}</span>
      <div className={styles.rowText}>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <div className={styles.rowActions}>{children}</div>
    </section>
  );
}
