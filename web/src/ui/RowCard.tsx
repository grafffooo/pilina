// A table row shown as a card on a phone: an identity line, quiet context lines, and an opened
// state with every field and action of the row (nothing hides in a sideways scroll).
import type { ReactNode } from 'react';
import { ChevronDownIcon } from './icons';
import styles from './RowCard.module.css';

interface RowCardProps {
  /** The tick box (or colour) left of the card; it is its own tap target, outside the toggle. */
  lead?: ReactNode;
  /** The row's identity: a size, a code, a material name. */
  title: ReactNode;
  /** A small pill beside the title, such as the quantity. */
  badge?: ReactNode;
  /** Quieter lines under the title. */
  lines?: ReactNode[];
  /** Right of the text: an edge glyph, a status. */
  trail?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Accessible name of the card's toggle button. */
  label: string;
  /** A switched-off row. */
  muted?: boolean;
  /** Marks rows that stand out, such as an exact search hit. */
  highlight?: boolean;
  /** The opened state: fields and actions. */
  children?: ReactNode;
}

export function RowCard({
  lead,
  title,
  badge,
  lines,
  trail,
  open,
  onToggle,
  label,
  muted,
  highlight,
  children,
}: RowCardProps) {
  return (
    <div
      className={styles.card}
      data-open={open ? '' : undefined}
      data-muted={muted ? '' : undefined}
      data-highlight={highlight ? '' : undefined}
    >
      <div className={styles.row}>
        {lead && <label className={styles.lead}>{lead}</label>}
        {/* Not a <button>: a locked (cut) project disables its form controls, but its cards
            must still open to be read. */}
        <div
          role="button"
          tabIndex={0}
          className={styles.head}
          aria-expanded={open}
          aria-label={label}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          <span className={styles.text}>
            <span className={styles.titleRow}>
              <span className={styles.title}>{title}</span>
              {badge && <span className={styles.badge}>{badge}</span>}
            </span>
            {lines?.map((line, i) => (
              <span key={i} className={styles.line}>
                {line}
              </span>
            ))}
          </span>
          {trail}
          <ChevronDownIcon size={20} className={styles.chevron} />
        </div>
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}

/** A labelled control inside an opened card. */
export function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Fields side by side; `qty` makes the last one narrow. */
export function CardFields({
  children,
  narrowLast,
}: {
  children: ReactNode;
  narrowLast?: boolean;
}) {
  return (
    <div className={styles.fields} data-narrow-last={narrowLast ? '' : undefined}>
      {children}
    </div>
  );
}

/** The buttons at the bottom of an opened card. */
export function CardActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export const cardStyles = styles;
