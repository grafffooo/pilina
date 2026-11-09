// Materials & prices: the board and edge-band library shared by every project.
import { CURRENCIES, formatMoney } from '../model/library';
import {
  addEdgeBand,
  addMaterial,
  removeEdgeBand,
  removeMaterial,
  updateEdgeBand,
  updateMaterial,
  updateSettings,
  useStore,
} from '../store/store';
import { ChevronLeftIcon, MenuIcon, MoreIcon } from '../ui/icons';
import { NumberInput } from '../ui/NumberInput';
import { Menu } from '../ui/Popover';
import ui from '../ui/ui.module.css';
import editor from '../editor/Editor.module.css';
import styles from './Library.module.css';

export function LibraryScreen({ onMenu }: { onMenu?: () => void }) {
  const materials = useStore((s) => s.materials);
  const bands = useStore((s) => s.edgeBands);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);
  const back = () => useStore.getState().setView('project');

  const usage = (id: string) =>
    projects.filter(
      (p) => p.stock.some((s) => s.materialId === id) || p.parts.some((x) => x.materialId === id),
    ).length;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        {onMenu && (
          <button type="button" className={ui.iconButton} aria-label="Projects" onClick={onMenu}>
            <MenuIcon size={22} />
          </button>
        )}
        <button type="button" className={ui.button} onClick={back}>
          <ChevronLeftIcon size={16} />
          Back to project
        </button>
        <h1 className={styles.title}>Materials & prices</h1>
      </div>

      <section className={editor.card} aria-labelledby="materials-h">
        <div className={editor.cardHeader}>
          <h2 id="materials-h">Boards</h2>
          <span className={editor.cardMeta}>
            A per-sheet price is for the size shown; other sizes (and offcuts) are priced by area.
          </span>
          <span className={editor.spacer} />
          <button
            type="button"
            className={ui.buttonPrimary}
            onClick={() => {
              const m = addMaterial('New board', { length: 2800, width: 2070 });
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>(`[data-material="${m.id}"]`)?.select(),
              );
            }}
          >
            Add board
          </button>
        </div>
        <div className={editor.tableWrap}>
          <table className={`${editor.table} ${styles.table}`}>
            <thead>
              <tr>
                <th className={styles.colColor}>
                  <span className="sr-only">Colour</span>
                </th>
                <th>Name</th>
                <th className={editor.num}>Thickness</th>
                <th className={editor.num}>Price</th>
                <th>Per</th>
                <th>For sheet size</th>
                <th className={editor.colMore}>
                  <span className="sr-only">More</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {materials.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    No boards yet. Add the sheet materials you buy, with their prices.
                  </td>
                </tr>
              )}
              {materials.map((m) => {
                const used = usage(m.id);
                return (
                  <tr key={m.id}>
                    <td className={styles.colColor}>
                      <input
                        type="color"
                        className={styles.color}
                        aria-label={`Colour of ${m.name}`}
                        value={m.color}
                        onChange={(e) => updateMaterial(m.id, { color: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className={`${editor.cell} ${editor.cellText}`}
                        aria-label="Board name"
                        data-material={m.id}
                        value={m.name}
                        onChange={(e) => updateMaterial(m.id, { name: e.target.value })}
                      />
                      {used > 0 && (
                        <span className={styles.usage}>
                          in {used} {used === 1 ? 'project' : 'projects'}
                        </span>
                      )}
                    </td>
                    <td className={styles.colNum}>
                      <span className={styles.withUnit}>
                        <NumberInput
                          className={editor.cell}
                          aria-label={`Thickness of ${m.name}, mm`}
                          value={m.thickness}
                          onCommit={(thickness) => updateMaterial(m.id, { thickness })}
                        />
                        mm
                      </span>
                    </td>
                    <td className={styles.colNum}>
                      <NumberInput
                        className={editor.cell}
                        aria-label={`Price of ${m.name}`}
                        aria-invalid={m.price === null || undefined}
                        placeholder="—"
                        value={m.price}
                        onCommit={(price) => updateMaterial(m.id, { price })}
                      />
                    </td>
                    <td>
                      <select
                        className={editor.select}
                        aria-label={`Price unit of ${m.name}`}
                        value={m.priceUnit}
                        onChange={(e) =>
                          updateMaterial(m.id, { priceUnit: e.target.value as 'sheet' | 'sqm' })
                        }
                      >
                        <option value="sheet">sheet</option>
                        <option value="sqm">m²</option>
                      </select>
                    </td>
                    <td>
                      {m.priceUnit === 'sheet' ? (
                        <span className={styles.size}>
                          <NumberInput
                            className={editor.cell}
                            aria-label={`Sheet length for the price of ${m.name}`}
                            placeholder="Length"
                            value={m.sheetLength}
                            onCommit={(sheetLength) => updateMaterial(m.id, { sheetLength })}
                          />
                          ×
                          <NumberInput
                            className={editor.cell}
                            aria-label={`Sheet width for the price of ${m.name}`}
                            placeholder="Width"
                            value={m.sheetWidth}
                            onCommit={(sheetWidth) => updateMaterial(m.id, { sheetWidth })}
                          />
                        </span>
                      ) : (
                        <span className={styles.muted}>any size</span>
                      )}
                    </td>
                    <td className={editor.colMore}>
                      <Menu
                        label={<MoreIcon />}
                        ariaLabel={`More actions for ${m.name}`}
                        triggerClassName={ui.iconButton}
                        items={[
                          {
                            label: 'Delete',
                            danger: true,
                            onSelect: () => {
                              if (
                                used === 0 ||
                                window.confirm(
                                  `“${m.name}” is used in ${used} ${used === 1 ? 'project' : 'projects'}. Delete it anyway? Those sheets will have no price.`,
                                )
                              ) {
                                removeMaterial(m.id);
                              }
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={editor.card} aria-labelledby="bands-h">
        <div className={editor.cardHeader}>
          <h2 id="bands-h">Edge bands</h2>
          <span className={editor.cardMeta}>
            Priced per metre, plus {settings.edgeAllowance} mm per banded edge
          </span>
          <span className={editor.spacer} />
          <button
            type="button"
            className={ui.button}
            onClick={() => {
              const b = addEdgeBand();
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>(`[data-band="${b.id}"]`)?.select(),
              );
            }}
          >
            Add edge band
          </button>
        </div>
        <div className={editor.tableWrap}>
          <table className={`${editor.table} ${styles.table}`}>
            <thead>
              <tr>
                <th>Name</th>
                <th className={editor.num}>Price per metre</th>
                <th className={editor.colMore}>
                  <span className="sr-only">More</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bands.length === 0 && (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    No edge bands yet.
                  </td>
                </tr>
              )}
              {bands.map((b) => (
                <tr key={b.id}>
                  <td>
                    <input
                      className={`${editor.cell} ${editor.cellText}`}
                      aria-label="Edge band name"
                      data-band={b.id}
                      value={b.name}
                      onChange={(e) => updateEdgeBand(b.id, { name: e.target.value })}
                    />
                  </td>
                  <td className={styles.colNum}>
                    <NumberInput
                      className={editor.cell}
                      aria-label={`Price per metre of ${b.name}`}
                      aria-invalid={b.pricePerMetre === null || undefined}
                      placeholder="—"
                      value={b.pricePerMetre}
                      onCommit={(pricePerMetre) => updateEdgeBand(b.id, { pricePerMetre })}
                    />
                  </td>
                  <td className={editor.colMore}>
                    <Menu
                      label={<MoreIcon />}
                      ariaLabel={`More actions for ${b.name}`}
                      triggerClassName={ui.iconButton}
                      items={[
                        { label: 'Delete', danger: true, onSelect: () => removeEdgeBand(b.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={editor.card} aria-labelledby="settings-h">
        <div className={editor.cardHeader}>
          <h2 id="settings-h">Settings</h2>
        </div>
        <div className={editor.form}>
          <label className={editor.formRow}>
            <span className={editor.formLabel}>Currency</span>
            <select
              className={ui.fieldInput}
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({formatMoney(1234.5, c)})
                </option>
              ))}
            </select>
          </label>
          <label className={editor.formRow}>
            <span className={editor.formLabel}>Edge band allowance</span>
            <span className={editor.inline}>
              <NumberInput
                className={`${ui.fieldInput} ${editor.shortInput}`}
                value={settings.edgeAllowance}
                onCommit={(v) => updateSettings({ edgeAllowance: Math.max(0, v ?? 0) })}
              />
              mm extra per banded edge
            </span>
          </label>
          <div className={editor.formRow}>
            <span className={editor.formLabel}>Reusable leftover</span>
            <span className={editor.inline}>
              at least
              <NumberInput
                className={`${ui.fieldInput} ${editor.shortInput}`}
                aria-label="Minimum leftover length, mm"
                value={settings.offcutMinLength}
                onCommit={(v) => updateSettings({ offcutMinLength: Math.max(0, v ?? 0) })}
              />
              ×
              <NumberInput
                className={`${ui.fieldInput} ${editor.shortInput}`}
                aria-label="Minimum leftover width, mm"
                value={settings.offcutMinWidth}
                onCommit={(v) => updateSettings({ offcutMinWidth: Math.max(0, v ?? 0) })}
              />
              mm
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
