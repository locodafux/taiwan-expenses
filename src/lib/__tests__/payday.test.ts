import { clampDayToMonth, daysUntil, leftoverByPaydayInMonth, nextPayday, toDateOnly } from '../payday';

describe('clampDayToMonth', () => {
  it('clamps day 31 into a 30-day month', () => {
    // Sep 2026 has 30 days, mirrors the SQL comment's example.
    expect(clampDayToMonth(31, new Date(2026, 8, 1)).getDate()).toBe(30);
  });

  it('keeps an in-range day unchanged', () => {
    expect(clampDayToMonth(15, new Date(2026, 8, 1)).getDate()).toBe(15);
  });
});

describe('nextPayday', () => {
  it('returns the next payday later this month', () => {
    const from = new Date(2026, 9, 3); // Oct 3, paydays on 5/20
    const result = nextPayday([5, 20], from);
    expect(toDateOnly(result)).toBe('2026-10-05');
  });

  it('rolls into next month once every payday this month has passed', () => {
    const from = new Date(2026, 9, 25); // Oct 25, paydays on 5/20
    const result = nextPayday([5, 20], from);
    expect(toDateOnly(result)).toBe('2026-11-05');
  });

  it('treats today as a valid payday', () => {
    const from = new Date(2026, 9, 20);
    const result = nextPayday([5, 20], from);
    expect(toDateOnly(result)).toBe('2026-10-20');
  });

  it('throws when there are no active incomes', () => {
    expect(() => nextPayday([])).toThrow();
  });
});

describe('daysUntil', () => {
  it('counts whole days between two dates', () => {
    expect(daysUntil(new Date(2026, 9, 20), new Date(2026, 9, 16))).toBe(4);
  });
});

describe('leftoverByPaydayInMonth', () => {
  const incomes = [
    { amount: 20000, recurring_day: 5, active: true },
    { amount: 20000, recurring_day: 20, active: true },
    { amount: 9000, recurring_day: 15, active: false }, // inactive, excluded
  ];
  const bills = [
    { amount: 5000, recurring_day: 5, end_date: null },
    { amount: 15000, recurring_day: 20, end_date: null },
  ];

  it('computes income minus same-day bills for each active payday', () => {
    const rows = leftoverByPaydayInMonth(incomes, bills, new Date(2026, 9, 1));
    expect(rows).toEqual([
      { day: 5, leftover: 15000 },
      { day: 20, leftover: 5000 },
    ]);
  });

  it('excludes a bill whose end_date has already passed', () => {
    const retiredBills = [{ amount: 5000, recurring_day: 5, end_date: '2026-01-01' }];
    const rows = leftoverByPaydayInMonth(incomes, retiredBills, new Date(2026, 9, 1));
    expect(rows.find((r) => r.day === 5)?.leftover).toBe(20000);
  });
});
