import { formatFolioDate, formatPeso } from './format';
import { fromDateOnly } from './payday';

type Row = { amount: number; status: string };

// "+₱ 8,000 carried from Mon, Oct 5" under a fund row that took over the previous payday's unticked amount.
export function carriedNote(row: { carried_amount?: number; carried_from?: string | null }) {
  return row.carried_amount && row.carried_from
    ? `+${formatPeso(row.carried_amount)} carried from ${formatFolioDate(fromDateOnly(row.carried_from))}`
    : null;
}

// Checked rows sink below unchecked ones; the sort is stable, so each half keeps its order.
export function checkedLast<T extends Row>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.status === 'checked') - Number(b.status === 'checked'));
}

// A ₱0 fund is nothing to tick off, so it is out of the count and both totals.
export function paydayTotals(rows: Row[]) {
  // A carried row's money lives on in the next payday's row, so it is not counted here.
  const countable = rows.filter((r) => r.amount !== 0 && r.status !== 'carried');
  const checkedRows = countable.filter((r) => r.status === 'checked');
  return {
    count: countable.length,
    checkedCount: checkedRows.length,
    total: countable.reduce((s, r) => s + r.amount, 0),
    checkedTotal: checkedRows.reduce((s, r) => s + r.amount, 0),
  };
}
