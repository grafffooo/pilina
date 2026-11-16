import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  autoMatchMaterial,
  buildPartRows,
  defaultSelectedBodyIds,
  groupByThickness,
  parse3DFile,
  thicknessKey,
  type Model3DBody,
  type Model3DDocument,
} from '../model/model3d';
import { newMaterial, type Material } from '../model/library';
import { newProject } from '../model/project';
import { insertParts, useStore } from '../store/store';
import { CloseIcon } from '../ui/icons';
import ui from '../ui/ui.module.css';
import { Model3DViewer } from './Model3DViewer';
import styles from './Model3DImportModal.module.css';

export interface Model3DImportModalProps {
  initialFile?: File | null;
  onClose: () => void;
}

type GroupViewMode = 'thickness' | 'component';

export function Model3DImportModal({ initialFile = null, onClose }: Model3DImportModalProps) {
  const { t } = useTranslation();
  const materials = useStore((s) => s.materials);
  const currentProjectId = useStore((s) => s.currentId);

  const [doc, setDoc] = useState<Model3DDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [maxThicknessMm, setMaxThicknessMm] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [hoveredBodyId, setHoveredBodyId] = useState<string | null>(null);
  const [hideDeselected, setHideDeselected] = useState(false);
  const [viewMode, setViewMode] = useState<GroupViewMode>('thickness');
  const [groupIdentical, setGroupIdentical] = useState(true);
  const [scopeByComponent, setScopeByComponent] = useState(true);
  const [targetMode, setTargetMode] = useState<'current' | 'new'>(() =>
    currentProjectId ? 'current' : 'new',
  );

  // Maps thicknessKey -> existing Material.id or `'__create__'` or `''` (unassigned)
  const [materialChoice, setMaterialChoice] = useState<Map<string, string>>(() => new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyParsed = (parsed: Model3DDocument) => {
    setError(null);
    setDoc(parsed);
    setSelectedIds(defaultSelectedBodyIds(parsed.bodies, maxThicknessMm));

    const groups = groupByThickness(parsed.bodies);
    const nextChoice = new Map<string, string>();
    for (const g of groups) {
      const match = autoMatchMaterial(g.thicknessMm, materials);
      nextChoice.set(g.key, match ? match.id : '__create__');
    }
    setMaterialChoice(nextChoice);
  };

  const loadFile = async (file: File) => {
    setError(null);
    try {
      const parsed = await parse3DFile(file);
      applyParsed(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!initialFile) return;
    let cancelled = false;
    void parse3DFile(initialFile).then(
      (parsed) => {
        if (!cancelled) applyParsed(parsed);
      },
      (err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const thicknessGroups = useMemo(() => (doc ? groupByThickness(doc.bodies) : []), [doc]);

  const componentGroups = useMemo(() => {
    if (!doc) return [];
    const map = new Map<string, { id: string; name: string; bodies: Model3DBody[] }>();
    for (const b of doc.bodies) {
      let g = map.get(b.componentId);
      if (!g) {
        g = { id: b.componentId, name: b.componentName, bodies: [] };
        map.set(b.componentId, g);
      }
      g.bodies.push(b);
    }
    return Array.from(map.values());
  }, [doc]);

  const toggleBody = (bodyId: string, wholeComponent = false) => {
    if (!doc) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (wholeComponent) {
        const target = doc.bodies.find((b) => b.id === bodyId);
        if (!target) return prev;
        const compBodies = doc.bodies.filter((b) => b.componentId === target.componentId);
        const allSelected = compBodies.every((b) => next.has(b.id));
        for (const b of compBodies) {
          if (allSelected) next.delete(b.id);
          else next.add(b.id);
        }
        return next;
      }
      if (next.has(bodyId)) next.delete(bodyId);
      else next.add(bodyId);
      return next;
    });
  };

  const toggleGroup = (bodies: readonly Model3DBody[], selectAll?: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const shouldSelect = selectAll ?? !bodies.every((b) => next.has(b.id));
      for (const b of bodies) {
        if (shouldSelect) next.add(b.id);
        else next.delete(b.id);
      }
      return next;
    });
  };

  const selectOnlyGroup = (bodies: readonly Model3DBody[]) => {
    setSelectedIds(new Set(bodies.map((b) => b.id)));
  };

  const applyThreshold = (threshold: number) => {
    setMaxThicknessMm(threshold);
    if (!doc) return;
    setSelectedIds(defaultSelectedBodyIds(doc.bodies, threshold));
  };

  const selectedCount = selectedIds.size;
  const selectedThicknessCount = useMemo(() => {
    const keys = new Set<string>();
    for (const b of doc?.bodies ?? []) {
      if (selectedIds.has(b.id)) keys.add(thicknessKey(b.dimensionsMm[0]));
    }
    return keys.size;
  }, [doc, selectedIds]);

  const handleImport = () => {
    if (!doc || selectedCount === 0) return;

    // Resolve/create materials for each selected thickness group.
    const createdMaterials: Material[] = [];
    const thicknessToMaterialId = new Map<string, string | null>();
    let matIndex = materials.length;

    for (const g of thicknessGroups) {
      const hasSelected = g.bodies.some((b) => selectedIds.has(b.id));
      if (!hasSelected) continue;
      const choice = materialChoice.get(g.key) ?? '';
      if (choice === '__create__') {
        const created = newMaterial(`${g.key} mm Sheet`, matIndex++);
        created.thickness = g.thicknessMm;
        createdMaterials.push(created);
        thicknessToMaterialId.set(g.key, created.id);
      } else {
        thicknessToMaterialId.set(g.key, choice || null);
      }
    }

    const partRows = buildPartRows(doc.bodies, selectedIds, thicknessToMaterialId, {
      groupIdentical,
      scopeByComponent,
    });

    if (targetMode === 'new' || !currentProjectId) {
      const proj = newProject(doc.name);
      proj.parts = partRows;
      useStore.getState().importProjects([proj], createdMaterials, []);
    } else {
      if (createdMaterials.length > 0) {
        useStore.getState().editLibrary((lib) => ({
          ...lib,
          materials: [...lib.materials, ...createdMaterials],
        }));
      }
      insertParts(partRows);
    }

    onClose();
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void loadFile(f);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void loadFile(f);
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="m3d-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <h2 id="m3d-title" className={styles.title}>
              {t('Import 3D Model')}
            </h2>
            {doc && (
              <span className={styles.subtitle}>
                {doc.name} · {doc.bodies.length} {t('parts')}
              </span>
            )}
          </div>
          <div className={styles.headerActions}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sc"
              hidden
              onChange={onFileChange}
            />
            <button
              type="button"
              className={ui.button}
              onClick={() => fileInputRef.current?.click()}
            >
              {doc ? t('Open another .sc') : t('Choose .sc file')}
            </button>
            <button
              type="button"
              className={ui.iconBtn}
              aria-label={t('Close')}
              onClick={onClose}
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {!doc ? (
          <div
            className={styles.dropPrompt}
            data-dragging={dragging ? '' : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <strong>{t('Drop a SolidCraft (.sc) file here')}</strong>
            <span>
              {t('Extracts bodies, sorts by thickness, and lets you deselect walls or non-cut parts in 3D.')}
            </span>
            <button
              type="button"
              className={ui.buttonPrimary}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('Choose .sc file')}
            </button>
          </div>
        ) : (
          <>
            <div className={styles.body}>
              <div className={styles.leftPane}>
                <Model3DViewer
                  bodies={doc.bodies}
                  selectedIds={selectedIds}
                  hoveredBodyId={hoveredBodyId}
                  hideDeselected={hideDeselected}
                  onToggleBody={toggleBody}
                  onHoverBody={setHoveredBodyId}
                />
                <div className={styles.toolbar}>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={hideDeselected}
                      onChange={(e) => setHideDeselected(e.target.checked)}
                    />
                    {t('Hide deselected')}
                  </label>
                  <label className={styles.thresholdLabel}>
                    {t('Max thickness (mm)')}
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      className={styles.thresholdInput}
                      value={maxThicknessMm}
                      onChange={(e) => applyThreshold(Number(e.target.value) || 50)}
                    />
                  </label>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={groupIdentical}
                      onChange={(e) => setGroupIdentical(e.target.checked)}
                    />
                    {t('Group identical sizes')}
                  </label>
                  {groupIdentical && (
                    <label className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={scopeByComponent}
                        onChange={(e) => setScopeByComponent(e.target.checked)}
                      />
                      {t('Per component')}
                    </label>
                  )}
                </div>
              </div>

              <div className={styles.rightPane}>
                <div className={styles.treeControls}>
                  <div className={styles.modeTabs}>
                    <button
                      type="button"
                      className={styles.modeTab}
                      data-active={viewMode === 'thickness' ? '' : undefined}
                      onClick={() => setViewMode('thickness')}
                    >
                      {t('By thickness')}
                    </button>
                    <button
                      type="button"
                      className={styles.modeTab}
                      data-active={viewMode === 'component' ? '' : undefined}
                      onClick={() => setViewMode('component')}
                    >
                      {t('By component')}
                    </button>
                  </div>
                  <div className={styles.bulkBtns}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setSelectedIds(new Set(doc.bodies.map((b) => b.id)))}
                    >
                      {t('All')}
                    </button>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => setSelectedIds(new Set())}
                    >
                      {t('None')}
                    </button>
                  </div>
                </div>

                <div className={styles.treeScroll}>
                  {viewMode === 'thickness'
                    ? thicknessGroups.map((group) => {
                        const selInGroup = group.bodies.filter((b) => selectedIds.has(b.id)).length;
                        const allInGroup = selInGroup === group.bodies.length;
                        const matChoice = materialChoice.get(group.key) ?? '__create__';

                        return (
                          <div key={group.key} className={styles.groupCard}>
                            <div className={styles.groupHeader}>
                              <label className={styles.groupToggle}>
                                <input
                                  type="checkbox"
                                  checked={allInGroup}
                                  ref={(el) => {
                                    if (el) {
                                      el.indeterminate = selInGroup > 0 && !allInGroup;
                                    }
                                  }}
                                  onChange={() => toggleGroup(group.bodies)}
                                />
                                <span>{group.key} mm</span>
                                <span className={styles.groupCount}>
                                  ({selInGroup}/{group.bodies.length})
                                </span>
                              </label>
                              <button
                                type="button"
                                className={styles.smallBtn}
                                onClick={() => selectOnlyGroup(group.bodies)}
                                title={t('Select only this thickness')}
                              >
                                {t('Only')}
                              </button>
                              <select
                                className={styles.materialSelect}
                                aria-label={t('Material for {{t}} mm', { t: group.key })}
                                value={matChoice}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setMaterialChoice((prev) => {
                                    const next = new Map(prev);
                                    next.set(group.key, val);
                                    return next;
                                  });
                                }}
                              >
                                <option value="__create__">
                                  + {t('Create "{{name}}"', { name: `${group.key} mm Sheet` })}
                                </option>
                                <option value="">{t('No material')}</option>
                                {materials.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                    {m.thickness != null ? ` (${m.thickness} mm)` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className={styles.bodyList}>
                              {group.bodies.map((b) => (
                                <label
                                  key={b.id}
                                  className={styles.bodyRow}
                                  data-hovered={hoveredBodyId === b.id ? '' : undefined}
                                  data-hidden-source={b.hiddenInSource ? '' : undefined}
                                  onMouseEnter={() => setHoveredBodyId(b.id)}
                                  onMouseLeave={() => setHoveredBodyId(null)}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(b.id)}
                                    onChange={() => toggleBody(b.id)}
                                  />
                                  <span className={styles.bodyName} title={b.name}>
                                    {b.name}
                                  </span>
                                  <span className={styles.bodyComp} title={b.componentName}>
                                    {b.componentName}
                                  </span>
                                  <span className={styles.bodyDims}>
                                    {Math.round(b.dimensionsMm[2])}×{Math.round(b.dimensionsMm[1])}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    : componentGroups.map((comp) => {
                        const selInComp = comp.bodies.filter((b) => selectedIds.has(b.id)).length;
                        const allInComp = selInComp === comp.bodies.length;
                        return (
                          <div key={comp.id} className={styles.groupCard}>
                            <div className={styles.groupHeader}>
                              <label className={styles.groupToggle}>
                                <input
                                  type="checkbox"
                                  checked={allInComp}
                                  ref={(el) => {
                                    if (el) {
                                      el.indeterminate = selInComp > 0 && !allInComp;
                                    }
                                  }}
                                  onChange={() => toggleGroup(comp.bodies)}
                                />
                                <span>{comp.name}</span>
                                <span className={styles.groupCount}>
                                  ({selInComp}/{comp.bodies.length})
                                </span>
                              </label>
                            </div>
                            <div className={styles.bodyList}>
                              {comp.bodies.map((b) => (
                                <label
                                  key={b.id}
                                  className={styles.bodyRow}
                                  data-hovered={hoveredBodyId === b.id ? '' : undefined}
                                  data-hidden-source={b.hiddenInSource ? '' : undefined}
                                  onMouseEnter={() => setHoveredBodyId(b.id)}
                                  onMouseLeave={() => setHoveredBodyId(null)}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(b.id)}
                                    onChange={() => toggleBody(b.id)}
                                  />
                                  <span className={styles.bodyName} title={b.name}>
                                    {b.name}
                                  </span>
                                  <span className={styles.bodyDims}>
                                    {Math.round(b.dimensionsMm[2])}×{Math.round(b.dimensionsMm[1])}×
                                    {thicknessKey(b.dimensionsMm[0])}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                </div>
              </div>
            </div>

            <div className={styles.footer}>
              <div className={styles.footerSummary}>
                {selectedCount} {t('parts selected')} · {selectedThicknessCount}{' '}
                {t('thicknesses')}
              </div>
              <div className={styles.footerActions}>
                {currentProjectId && (
                  <select
                    className={styles.targetSelect}
                    aria-label={t('Import destination')}
                    value={targetMode}
                    onChange={(e) => setTargetMode(e.target.value as 'current' | 'new')}
                  >
                    <option value="current">{t('Add to current project')}</option>
                    <option value="new">{t('Create new project')}</option>
                  </select>
                )}
                <button type="button" className={ui.button} onClick={onClose}>
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  className={ui.buttonPrimary}
                  disabled={selectedCount === 0}
                  onClick={handleImport}
                >
                  {t('Import {{count}} parts', { count: selectedCount })}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
