import { PLAN_MONTHS, TAIWAN_TARGET, buildPlan, total, validatePlan } from '../paydayPlan';

const plan = buildPlan();
const byId = (id: string) => plan.paydays.find((p) => p.id === id)!;

describe('paydayPlan', () => {
  it('lays out four paydays a month, on the real calendar dates', () => {
    expect(plan.paydays).toHaveLength(24);
    expect(plan.paydays.filter((p) => p.month === '2027-02').map((p) => p.day)).toEqual([5, 15, 20, 28]);
    expect(plan.paydays.filter((p) => p.month === '2026-11').map((p) => p.day)).toEqual([5, 15, 20, 30]);
  });

  it('keeps income per payday (Ann gets 10,000, 60,000 a month) and never a lump sum', () => {
    expect(PLAN_MONTHS.map((m) => plan.paydays.filter((p) => p.month === m).map((p) => p.income))).toEqual(
      PLAN_MONTHS.map(() => [20000, 10000, 20000, 10000]),
    );
  });

  it('matches the spec\'s October 5 breakdown', () => {
    const p = byId('2026-10-05');
    expect(p.expenses.map((e) => [e.name, e.amount])).toEqual([
      ['Medicine', 2000],
      ['Food', 5000],
      ['Move It', 1420],
      ['Bus', 360],
      ['Jeep', 840],
    ]);
    expect(p.expenseTotal).toBe(9620);
    expect(p.debts).toEqual([{ name: 'Atome', amount: 6500, until: 2 }]);
  });

  it('ends debts on schedule and never shows SLoan / RT Mhae', () => {
    const names = (id: string) => [...byId(id).expenses, ...byId(id).debts].map((l) => l.name);
    expect(names('2026-12-05')).toContain('Atome');
    expect(names('2027-01-05')).not.toContain('Atome');
    expect(names('2026-11-15')).toContain('Shopee');
    expect(names('2026-12-15')).not.toContain('Shopee');
    expect(names('2026-10-15')).toContain('MacBook');
    expect(names('2026-11-15')).not.toContain('MacBook');
    expect(names('2027-03-20')).toContain('Nano');
    const all = plan.paydays.flatMap((p) => [...p.expenses, ...p.debts].map((l) => l.name));
    expect(all).not.toContain('SLoan');
    expect(all).not.toContain('RT Mhae');
  });

  it('reaches the Taiwan target with no negative payday, and every payday and month adds up', () => {
    expect(plan.taiwanTotal).toBe(TAIWAN_TARGET);
    expect(plan.paydays[plan.paydays.length - 1].taiwanCumulative).toBe(TAIWAN_TARGET);
    for (const p of plan.paydays) {
      expect(Math.min(p.taiwan, p.emergency, p.savings, p.excess)).toBeGreaterThanOrEqual(0);
    }
    expect(validatePlan(plan)).toEqual([]);
    for (const m of PLAN_MONTHS) {
      const ps = plan.paydays.filter((p) => p.month === m);
      const out = ['expenseTotal', 'debtTotal', 'taiwan', 'emergency', 'savings', 'excess'] as const;
      expect(out.reduce((s, k) => s + total(ps, k), 0)).toBe(60000);
    }
  });

  it('flags a payday whose allocations do not add up, and an unreachable target', () => {
    const broken = buildPlan();
    broken.paydays[0] = { ...broken.paydays[0], excess: broken.paydays[0].excess + 10 };
    expect(validatePlan(broken).map((i) => i.scope)).toEqual(['2026-10-05', '2026-10']);
    expect(validatePlan(buildPlan(10_000_000)).some((i) => i.scope === 'taiwan')).toBe(true);
  });
});
