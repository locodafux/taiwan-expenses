import { archiveRowLabel, groupArchive, type ArchiveRow } from '../archive';

const row = (o: Partial<ArchiveRow> & { id: string }): ArchiveRow => ({
  payday_date: '2026-10-15',
  amount: 100,
  status: 'checked',
  manual: false,
  categories: { name: 'TAIWAN', kind: 'fund' },
  bill_items: null,
  ...o,
});

describe('groupArchive', () => {
  it('groups by payday newest first, splitting bills from funds and totaling ticked rows', () => {
    const out = groupArchive([
      row({ id: 'a', payday_date: '2026-10-01', amount: 50 }),
      row({ id: 'b', payday_date: '2026-10-15', amount: 200, categories: { name: 'RENT', kind: 'bill' }, bill_items: { label: 'Rent' } }),
      row({ id: 'c', payday_date: '2026-10-15', amount: 300 }),
    ]);
    expect(out.map((p) => p.date)).toEqual(['2026-10-15', '2026-10-01']);
    expect(out[0].bills.map((r) => r.id)).toEqual(['b']);
    expect(out[0].funds.map((r) => r.id)).toEqual(['c']);
    expect(out[0].total).toBe(500);
    expect(out[1].total).toBe(50);
  });

  it('never counts non-checked rows, and drops a payday with nothing ticked', () => {
    const out = groupArchive([
      row({ id: 'a', status: 'pending' }),
      row({ id: 'b', status: 'carried', payday_date: '2026-10-01' }),
      row({ id: 'c', payday_date: '2026-10-01', amount: 75 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-10-01');
    expect(out[0].total).toBe(75);
  });
});

it('labels a bill row by its line item, else its category', () => {
  expect(archiveRowLabel(row({ id: 'a', bill_items: { label: 'Rent' } }))).toBe('Rent');
  expect(archiveRowLabel(row({ id: 'b' }))).toBe('TAIWAN');
});
