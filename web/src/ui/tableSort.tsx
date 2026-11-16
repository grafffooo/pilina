import { useCallback, useState, type ReactNode } from 'react';
import styles from './tableSort.module.css';

export type SortDir = 'asc' | 'desc';

export type SortValue = string | number | boolean | null | undefined;

export function compareSortValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(b) - Number(a);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function useTableSort<K extends string>() {
  const [sort, setSort] = useState<{ key: K; dir: SortDir } | null>(null);

  const toggle = useCallback((key: K) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const sortRows = useCallback(
    <T,>(rows: readonly T[], getValue: (row: T, key: K) => SortValue, isTrailing?: (row: T) => boolean): T[] => {
      if (!sort) return [...rows];
      const factor = sort.dir === 'asc' ? 1 : -1;
      const indexed = rows.map((row, idx) => ({
        row,
        idx,
        trailing: isTrailing ? isTrailing(row) : false,
      }));
      indexed.sort((a, b) => {
        if (a.trailing !== b.trailing) return a.trailing ? 1 : -1;
        const va = getValue(a.row, sort.key);
        const vb = getValue(b.row, sort.key);
        const aEmpty = va === null || va === undefined || va === '';
        const bEmpty = vb === null || vb === undefined || vb === '';
        if (aEmpty && bEmpty) return a.idx - b.idx;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        const cmp = compareSortValues(va, vb);
        return cmp !== 0 ? cmp * factor : a.idx - b.idx;
      });
      return indexed.map((x) => x.row);
    },
    [sort],
  );

  return {
    sortKey: sort?.key ?? null,
    sortDir: sort?.dir ?? null,
    toggle,
    sortRows,
  };
}

export function SortTh<K extends string>({
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  numeric,
  children,
}: {
  col: K;
  sortKey: K | null;
  sortDir: SortDir | null;
  onSort: (col: K) => void;
  className?: string;
  numeric?: boolean;
  children: ReactNode;
}) {
  const active = sortKey === col;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  const indicator = active ? (sortDir === 'asc' ? '▲' : '▼') : '▲';
  return (
    <th
      className={[className, numeric ? styles.num : ''].filter(Boolean).join(' ') || undefined}
      aria-sort={ariaSort}
    >
      <button type="button" className={styles.sortBtn} onClick={() => onSort(col)}>
        <span>{children}</span>
        <span className={active ? styles.indicator : styles.indicatorIdle} aria-hidden="true">
          {indicator}
        </span>
      </button>
    </th>
  );
}
