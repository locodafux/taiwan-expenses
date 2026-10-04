type Row = { amount: number; status: string };

// Checked rows sink below unchecked ones; the sort is stable, so each half keeps its order.
export function checkedLast<T extends Row>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.status === 'checked') - Number(b.status === 'checked'));
}

// A ₱0 fund is nothing to tick off, so it is out of the count and both totals.
export function paydayTotals(rows: Row[]) {
  const countable = rows.filter((r) => r.amount !== 0);
  const checkedRows = countable.filter((r) => r.status === 'checked');
  return {
    count: countable.length,
    checkedCount: checkedRows.length,
    total: countable.reduce((s, r) => s + r.amount, 0),
    checkedTotal: checkedRows.reduce((s, r) => s + r.amount, 0),
  };
}
