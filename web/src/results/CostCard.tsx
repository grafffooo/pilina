import { formatMetres, formatNumber, formatSquareMetres } from '../lib/format';
import { formatMoney } from '../model/library';
import type { Project } from '../model/project';
import { useStore } from '../store/store';
import { WarningIcon } from '../ui/icons';
import styles from './Results.module.css';

/** Project cost: board per material, offcut credit, edge banding and extra lines. */
export function CostCard({ project }: { project: Project }) {
  const cost = useStore((s) => s.cost);
  const currency = useStore((s) => s.settings.currency);
  if (!cost) return null;

  const money = (n: number) => formatMoney(n, currency);
  const mode = project.pricing;
  const modeText =
    mode.mode === 'area'
      ? `area used + ${formatNumber(mode.wastePct)}% waste`
      : mode.offcutCredit
        ? 'whole sheets, leftovers credited'
        : 'whole sheets';
  const missing = [
    ...cost.materials.filter((m) => !m.priced).map((m) => m.material),
    ...cost.edgeBands.filter((b) => !b.priced).map((b) => b.band),
  ];
  const openLibrary = () => useStore.getState().setView('library');

  return (
    <section className={styles.costCard} aria-labelledby="cost-h">
      <div className={styles.costHead}>
        <div>
          <h3 id="cost-h" className={styles.costTitle}>
            Cost
          </h3>
          <span className={styles.costMode}>Board charged by {modeText}</span>
        </div>
        <span className={styles.costTotal}>
          {money(cost.total)}
          {!cost.complete && <span className={styles.costPartial}> + unpriced</span>}
        </span>
      </div>

      <dl className={styles.costLines}>
        {cost.materials.map((m) => (
          <div key={m.material} className={styles.costLine}>
            <dt>
              {m.material}
              <span className={styles.costNote}>
                {mode.mode === 'area'
                  ? `${formatSquareMetres(m.usedArea)} used`
                  : `${m.sheets} ${m.sheets === 1 ? 'sheet' : 'sheets'}`}
              </span>
            </dt>
            <dd>{m.priced ? money(m.gross) : <NoPrice onClick={openLibrary} />}</dd>
            {m.credit > 0 && (
              <>
                <dt className={styles.costCredit}>
                  Leftovers credited
                  <span className={styles.costNote}>{formatSquareMetres(m.creditArea)}</span>
                </dt>
                <dd className={styles.costCredit}>−{money(m.credit)}</dd>
              </>
            )}
          </div>
        ))}
        {cost.edgeBands.map((b) => (
          <div key={b.band} className={styles.costLine}>
            <dt>
              {b.band}
              <span className={styles.costNote}>{formatMetres(b.length)}</span>
            </dt>
            <dd>{b.priced ? money(b.cost) : <NoPrice onClick={openLibrary} />}</dd>
          </div>
        ))}
        {project.pricing.extras
          .filter((x) => x.amount !== null)
          .map((x) => (
            <div key={x.id} className={styles.costLine}>
              <dt>
                {x.label || 'Extra cost'}
                {(x.qty ?? 1) !== 1 && <span className={styles.costNote}>×{x.qty}</span>}
              </dt>
              <dd>{money(x.amount! * (x.qty ?? 1))}</dd>
            </div>
          ))}
      </dl>

      {missing.length > 0 && (
        <p className={styles.costMissing}>
          <WarningIcon size={14} />
          <span>
            No price for {missing.join(', ')}, so the total is incomplete.{' '}
            <button type="button" className={styles.linkButton} onClick={openLibrary}>
              Set prices
            </button>
          </span>
        </p>
      )}
    </section>
  );
}

function NoPrice({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.linkButton} onClick={onClick}>
      Set price
    </button>
  );
}
