// Brings projects in: old CutList .md files or browser storage, and shared .cutlist.json files.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  OLD_STORAGE_KEY,
  convertOldProjects,
  importProjectFile,
  isProjectFile,
  parseOldMarkdown,
  parseOldStorage,
  type OldProject,
} from '../model/importExport';
import type { EdgeBand, Material } from '../model/library';
import type { Project } from '../model/project';
import { useStore } from '../store/store';
import { CloseIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import styles from './ImportDialog.module.css';
import { useTranslation } from 'react-i18next';

function readOldStorage(): OldProject[] {
  try {
    const raw = localStorage.getItem(OLD_STORAGE_KEY);
    return raw ? parseOldStorage(raw) : [];
  } catch {
    return [];
  }
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState('');
  const [oldHere] = useState(readOldStorage);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialog.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Adds converted projects and reports what happened. */
  const commit = (
    projects: Project[],
    materials: Material[],
    bands: EdgeBand[],
    skipped: string[],
  ) => {
    if (projects.length > 0) useStore.getState().importProjects(projects, materials, bands);
    const parts = [
      projects.length > 0 &&
        t('imported_projects', {
          count: projects.length,
          names: projects.map((p) => p.name).join(', '),
        }),
      materials.length > 0 && t('added_materials', { count: materials.length }),
      skipped.length > 0 && t('Couldn’t read: {{files}}.', { files: skipped.join(', ') }),
    ].filter(Boolean);
    setMessage({ ok: projects.length > 0, text: parts.join(' ') || t('Nothing to import.') });
  };

  const importOld = (old: OldProject[], skipped: string[] = []) => {
    const { materials } = useStore.getState();
    const { projects, newMaterials } = convertOldProjects(old, materials);
    commit(projects, newMaterials, [], skipped);
  };

  const importFiles = async (files: FileList | File[]) => {
    const old: OldProject[] = [];
    const shared: Project[] = [];
    let materials: Material[] = [];
    let bands: EdgeBand[] = [];
    const skipped: string[] = [];
    const state = useStore.getState();
    const ids = new Set(state.projects.map((p) => p.id));
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        if (/\.(md|markdown|txt)$/i.test(file.name)) {
          old.push(parseOldMarkdown(text, file.name));
          continue;
        }
        const data: unknown = JSON.parse(text);
        if (isProjectFile(data)) {
          const r = importProjectFile(
            data,
            [...state.materials, ...materials],
            [...state.edgeBands, ...bands],
            ids,
          );
          shared.push(r.project);
          ids.add(r.project.id);
          materials = [...materials, ...r.newMaterials];
          bands = [...bands, ...r.newEdgeBands];
        } else {
          old.push(...parseOldStorage(text));
        }
      } catch {
        skipped.push(file.name);
      }
    }
    const converted = convertOldProjects(old, [...state.materials, ...materials]);
    commit(
      [...shared, ...converted.projects],
      [...materials, ...converted.newMaterials],
      bands,
      skipped,
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void importFiles(e.dataTransfer.files);
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
        aria-labelledby="import-h"
      >
        <div className={styles.head}>
          <h2 id="import-h">{t('Import projects')}</h2>
          <button type="button" className={ui.iconButton} aria-label={t('Close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {oldHere.length > 0 && (
          <div className={styles.found}>
            <span>{t('found_old_projects', { count: oldHere.length })}</span>
            <button type="button" className={ui.buttonPrimary} onClick={() => importOld(oldHere)}>
              {t('Import them')}
            </button>
          </div>
        )}

        <label
          className={dragging ? styles.dropActive : styles.drop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            multiple
            accept=".md,.markdown,.txt,.json,application/json,text/markdown"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) void importFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <span className={styles.dropTitle}>{t('Drop files here, or click to choose')}</span>
          <span className={styles.dropHint}>
            {t(
              'Old CutList .md exports (select many at once), or .cutlist.json project files shared from this app.',
            )}
          </span>
        </label>

        <details className={styles.paste}>
          <summary>{t('Paste the old app’s saved data instead')}</summary>
          <p className={styles.dropHint}>
            {t(
              'In the old CutList, open the browser console, run this command, then paste the result here:',
            )}
          </p>
          <code className={styles.command}>copy(localStorage.{OLD_STORAGE_KEY})</code>
          <textarea
            className={styles.textarea}
            aria-label={t('Old CutList data')}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='[{"title": "…", "parts": [ … ]}]'
          />
          <button
            type="button"
            className={ui.button}
            disabled={!pasted.trim()}
            onClick={() => {
              try {
                importOld(parseOldStorage(pasted));
                setPasted('');
              } catch {
                setMessage({
                  ok: false,
                  text: t('That doesn’t look like the old CutList’s data.'),
                });
              }
            }}
          >
            {t('Import pasted data')}
          </button>
        </details>

        {message && (
          <p className={message.ok ? styles.ok : styles.error} role="status">
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
