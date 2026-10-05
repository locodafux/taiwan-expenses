export type ArchiveRow = {
  id: string;
  payday_date: string;
  amount: number;
  status: string;
  manual: boolean;
  categories: { name: string; kind: string } | null;
  bill_items: { label: string } | null;
};

export type ArchivePayday = {
  date: string;
  bills: ArchiveRow[];
  funds: ArchiveRow[];
  total: number;
};

// Groups ledger rows into one entry per payday, newest first. Only
// status = 'checked' rows count as ticked - anything else (pending, or a
// future status such as 'carried') never shows up in the archive.
export function groupArchive(rows: ArchiveRow[]): ArchivePayday[] {
  const byDate = new Map<string, ArchivePayday>();
  for (const row of rows) {
    if (row.status !== 'checked') continue;
    let payday = byDate.get(row.payday_date);
    if (!payday) byDate.set(row.payday_date, (payday = { date: row.payday_date, bills: [], funds: [], total: 0 }));
    (row.categories?.kind === 'bill' ? payday.bills : payday.funds).push(row);
    payday.total += row.amount;
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function archiveRowLabel(row: ArchiveRow): string {
  return row.bill_items?.label ?? row.categories?.name ?? 'Unknown';
}
