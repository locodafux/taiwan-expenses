import { clampDayToMonth, daysUntil, fromDateOnly, leftoverByPaydayInMonth, nextPayday, monthDueDate, paymentsLeft, toDateOnly } from '../payday';

describe('fromDateOnly', () => {
  it('round-trips with toDateOnly regardless of local timezone', () => {
    expect(toDateOnly(fromDateOnly('2026-09-14'))).toBe('2026-09-14');
  });

  it('reads back the same calendar day new Date(string) can get wrong near UTC midnight', () => {
    const d = fromDateOnly('2026-01-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

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

describe('payment terms', () => {
  const sep21 = new Date(2026, 8, 21);

  it("uses the chosen month's due date", () => {
    expect(monthDueDate(5, '2027-09')).toBe('2027-09-05');
  });

  it('clamps the last due date into short months', () => {
    expect(monthDueDate(31, '2027-02')).toBe('2027-02-28');
  });

  it('counts payments left through the end month', () => {
    // Day 5 already passed in Sep, so Oct 2026 - Sep 2027 is 12 payments.
    expect(paymentsLeft(5, monthDueDate(5, '2027-09'), sep21)).toBe(12);
    // Day 25 is still ahead this month.
    expect(paymentsLeft(25, monthDueDate(25, '2026-09'), sep21)).toBe(1);
  });

  it('is 0 once the term is over', () => {
    expect(paymentsLeft(5, '2026-09-05', sep21)).toBe(0);
  });
});
