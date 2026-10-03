import {
  appToday,
  categoryActiveInMonth,
  groupMonthLeft,
  clampDayToMonth,
  daysUntil,
  fromDateOnly,
  incomeAmountForPayday,
  leftoverByPaydayInMonth,
  nextPayday,
  paydayAtOffset,
  monthDueDate,
  nextMonth,
  paymentsLeft,
  toDateOnly,
} from '../payday';

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

  it('steps backward and forward from the next payday', () => {
    const from = new Date(2026, 9, 3); // Oct 3, paydays on 5/20

    expect(toDateOnly(paydayAtOffset([5, 20], -1, from))).toBe('2026-09-20');
    expect(toDateOnly(paydayAtOffset([5, 20], 0, from))).toBe('2026-10-05');
    expect(toDateOnly(paydayAtOffset([5, 20], 1, from))).toBe('2026-10-20');
  });

  it('projects all incomes clamped into a short month payday', () => {
    const payday = new Date(2026, 1, 28); // February 28, including a recurring 31st income

    expect(
      incomeAmountForPayday([
        { amount: 20000, recurring_day: 28, active: true },
        { amount: 15000, recurring_day: 31, active: true },
        { amount: 9000, recurring_day: 28, active: false },
      ], payday),
    ).toBe(35000);
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

// The app starts in October 2026 (captain's call): no default "today" may
// resolve earlier, even while the real date is still in September.
describe('October 2026 floor', () => {
  afterEach(() => jest.useRealTimers());

  it('appToday floors any earlier date to Oct 1 2026 and leaves later ones alone', () => {
    expect(toDateOnly(appToday(new Date(2026, 8, 29)))).toBe('2026-10-01');
    expect(toDateOnly(appToday(new Date(2025, 0, 1)))).toBe('2026-10-01');
    expect(toDateOnly(appToday(new Date(2026, 10, 10)))).toBe('2026-11-10');
  });

  it("on the real Sep 29 2026 the next payday is Oct 5, never Ann's Sep 30, and nothing steps back before Oct", () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 29) });
    expect(toDateOnly(nextPayday([5, 30]))).toBe('2026-10-05');
    expect(toDateOnly(paydayAtOffset([5, 30], 0))).toBe('2026-10-05');
    // One step back would be Sep 30 - callers must treat it as out of range.
    expect(toDateOnly(paydayAtOffset([5, 30], -1)) < '2026-10-01').toBe(true);
  });

  it('nextMonth (earliest goal deadline) is November on Sep 29 2026, since October is the first month saved', () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 29) });
    expect(nextMonth()).toBe('2026-11');
  });
});

describe('categoryActiveInMonth', () => {
  it('is true from the start month onward, with no end', () => {
    const c = { start_month: '2026-11-01' };
    expect(categoryActiveInMonth(c, '2026-10')).toBe(false);
    expect(categoryActiveInMonth(c, '2026-11')).toBe(true);
    expect(categoryActiveInMonth(c, '2035-06')).toBe(true);
  });
});

describe('groupMonthLeft', () => {
  const siblings = [
    { id: 'pin', name: 'Pinatubo', start_month: '2026-10-01', percent: 0 },
    { id: 'tw', name: 'Taiwan Fund', start_month: '2026-12-01', percent: 100 },
  ];
  const overrides = new Map([['pin:2026-10', 100]]);

  it('counts siblings by override-or-default and leaves out ones not started', () => {
    const oct = groupMonthLeft('2026-10', 0, siblings, overrides);
    expect(oct.left).toBe(0);
    expect(oct.waiting.map((s) => s.name)).toEqual(['Taiwan Fund']);
    expect(groupMonthLeft('2026-12', 0, siblings, overrides).left).toBe(0);
  });

  it('goes negative when this fund takes too much', () => {
    expect(groupMonthLeft('2026-10', 30, siblings, overrides).left).toBe(-30);
  });
});
