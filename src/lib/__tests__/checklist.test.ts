import { checkedLast, paydayTotals } from '../checklist';

const rows = [
  { id: 'a', amount: 100, status: 'checked' },
  { id: 'b', amount: 200, status: 'pending' },
  { id: 'c', amount: 0, status: 'pending' },
  { id: 'd', amount: 300, status: 'checked' },
  { id: 'e', amount: 400, status: 'pending' },
];

describe('checklist helpers', () => {
  it('sinks checked rows below unchecked ones, keeping order within each half', () => {
    expect(checkedLast(rows).map((r) => r.id)).toEqual(['b', 'c', 'e', 'a', 'd']);
  });

  it('does not mutate its input', () => {
    checkedLast(rows);
    expect(rows[0].id).toBe('a');
  });

  it('totals every non-zero row and how much of it is checked', () => {
    expect(paydayTotals(rows)).toEqual({ count: 4, checkedCount: 2, total: 1000, checkedTotal: 400 });
  });

  it('is empty-safe', () => {
    expect(paydayTotals([])).toEqual({ count: 0, checkedCount: 0, total: 0, checkedTotal: 0 });
  });
});
