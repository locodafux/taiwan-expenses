// The Oct 2026 - Mar 2027 payday plan behind the Breakdown screen's calendar:
// a FIXED, hand-scripted planner (fixed paydays, bills and debts on a
// schedule), deliberately independent of incomes/bill_items/ledger_entries -
// nothing here reads or writes the household's real ledger, funds or Taiwan
// goal. Every figure below is derived from the per-payday source data; there
// are no hardcoded totals. Allocation math follows the reference prototype:
// bills and debts first, Taiwan takes a share of each payday's free cash
// sized so the fund lands on its target by the last payday, and Emergency /
// Savings split what's left.
import { addMonths } from '@/lib/payday';

export const PLAN_START = '2026-10';
export const PLAN_MONTH_COUNT = 6; // Oct 2026 .. Mar 2027
export const TAIWAN_TARGET = 80000;
// ponytail: fixed shares of what's left after Taiwan (rest is Excess); make
// them settings if the couple wants to tune them.
const EMERGENCY_PCT = 40;
const SAVINGS_PCT = 40;

export const PLAN_MONTHS = Array.from({ length: PLAN_MONTH_COUNT }, (_, i) => addMonths(PLAN_START, i));

// `until` = last plan-month index (0 = Oct 2026) the item is still due.
type Item = { name: string; amount: number; until?: number };
type Payday = { day: number; who: string; income: number; expenses: Item[]; debts: Item[] };

const PAYDAYS: Payday[] = [
  {
    day: 5,
    who: 'Leo',
    income: 20000,
    expenses: [
      { name: 'Medicine', amount: 2000 },
      { name: 'Food', amount: 5000 },
      { name: 'Move It', amount: 1420 },
      { name: 'Bus', amount: 360 },
      { name: 'Jeep', amount: 840 },
    ],
    debts: [{ name: 'Atome', amount: 6500, until: 2 }],
  },
  {
    day: 15,
    who: 'Ann',
    income: 10000,
    expenses: [
      { name: 'MacBook', amount: 3700, until: 0 },
      { name: 'Water', amount: 1500 },
      { name: 'Internet', amount: 1000 },
    ],
    debts: [{ name: 'Shopee', amount: 3000, until: 1 }],
  },
  {
    day: 20,
    who: 'Leo',
    income: 20000,
    expenses: [
      { name: 'Food', amount: 5000 },
      { name: 'Move It', amount: 1420 },
      { name: 'Bus', amount: 360 },
      { name: 'Jeep', amount: 840 },
      { name: 'Internet', amount: 1600 },
      { name: 'Claude', amount: 1500 },
      { name: 'Netflix', amount: 600 },
      { name: 'Load', amount: 300 },
    ],
    debts: [{ name: 'Nano', amount: 2620, until: 5 }],
  },
  {
    day: 30,
    who: 'Ann',
    income: 10000,
    expenses: [
      { name: 'House', amount: 4000 },
      { name: 'Electricity/Kuryente', amount: 1500 },
    ],
    debts: [],
  },
];

// Ended in September 2026 - must never show up from October on.
const ENDED_DEBTS = ['SLoan', 'RT Mhae'];

export type PlanLine = { name: string; amount: number; until?: number };
export type PlannedPayday = {
  id: string; // 'YYYY-MM-DD', the actual calendar date (30th -> Feb 28)
  month: string; // 'YYYY-MM'
  monthIndex: number;
  day: number;
  who: string;
  income: number;
  expenses: PlanLine[];
  debts: PlanLine[];
  expenseTotal: number;
  debtTotal: number;
  taiwan: number;
  emergency: number;
  savings: number;
  excess: number;
  taiwanCumulative: number;
};
export type Plan = { paydays: PlannedPayday[]; target: number; taiwanTotal: number };

const sum = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);
const floor10 = (n: number) => Math.floor(n / 10) * 10;
// Sum of one numeric field across paydays - the monthly summary is only ever this.
export const total = (paydays: PlannedPayday[], key: 'income' | 'expenseTotal' | 'debtTotal' | 'taiwan' | 'emergency' | 'savings' | 'excess') =>
  paydays.reduce((s, p) => s + p[key], 0);

export function buildPlan(target: number = TAIWAN_TARGET): Plan {
  const rows = PLAN_MONTHS.flatMap((month, monthIndex) => {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return PAYDAYS.map((p) => {
      const day = Math.min(p.day, lastDay);
      const due = (items: Item[]) =>
        items.filter((i) => i.until === undefined || monthIndex <= i.until).map((i) => ({ ...i }));
      const expenses = due(p.expenses);
      const debts = due(p.debts);
      const expenseTotal = sum(expenses);
      const debtTotal = sum(debts);
      return { p, month, monthIndex, day, expenses, debts, expenseTotal, debtTotal, free: p.income - expenseTotal - debtTotal };
    });
  });

  // Taiwan: proportional to each payday's free cash, so a small payday isn't
  // squeezed and none can go negative.
  const freeTotal = rows.reduce((s, r) => s + Math.max(0, r.free), 0);
  const taiwanTotal = Math.min(target, freeTotal);
  const taiwan = rows.map((r) => (freeTotal ? floor10((Math.max(0, r.free) * taiwanTotal) / freeTotal) : 0));
  // Rounding leftover goes to the latest paydays that still have room.
  let given = taiwan.reduce((s, t) => s + t, 0);
  for (let i = rows.length - 1; i >= 0 && given < taiwanTotal; i--) {
    const add = Math.min(Math.max(0, rows[i].free) - taiwan[i], taiwanTotal - given);
    taiwan[i] += add;
    given += add;
  }

  let cumulative = 0;
  const paydays = rows.map((r, i): PlannedPayday => {
    const left = Math.max(0, r.free - taiwan[i]);
    const emergency = floor10((left * EMERGENCY_PCT) / 100);
    const savings = Math.min(floor10((left * SAVINGS_PCT) / 100), left - emergency);
    cumulative += taiwan[i];
    return {
      id: `${r.month}-${String(r.day).padStart(2, '0')}`,
      month: r.month,
      monthIndex: r.monthIndex,
      day: r.day,
      who: r.p.who,
      income: r.p.income,
      expenses: r.expenses,
      debts: r.debts,
      expenseTotal: r.expenseTotal,
      debtTotal: r.debtTotal,
      taiwan: taiwan[i],
      emergency,
      savings,
      excess: r.free - taiwan[i] - emergency - savings,
      taiwanCumulative: cumulative,
    };
  });
  return { paydays, target, taiwanTotal: given };
}

export type PlanIssue = { scope: string; message: string };

// Every rule from the spec, checked against the built plan (not the source
// data), so a bad edit to either shows up as a flagged mismatch.
export function validatePlan(plan: Plan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const expectedMonthly = PAYDAYS.reduce((s, p) => s + p.income, 0);
  for (const p of plan.paydays) {
    const alloc = p.expenseTotal + p.debtTotal + p.taiwan + p.emergency + p.savings + p.excess;
    if (alloc !== p.income) issues.push({ scope: p.id, message: `Allocations ${alloc} don't add up to income ${p.income}` });
    if ([p.taiwan, p.emergency, p.savings, p.excess].some((n) => n < 0)) {
      issues.push({ scope: p.id, message: 'Negative balance after bills and debts' });
    }
    const names = [...p.expenses, ...p.debts].map((l) => l.name);
    if (new Set(names).size !== names.length) issues.push({ scope: p.id, message: 'Duplicate item' });
    for (const d of p.debts) {
      if (ENDED_DEBTS.includes(d.name)) issues.push({ scope: p.id, message: `${d.name} ended in September 2026` });
      if (d.until !== undefined && p.monthIndex > d.until) issues.push({ scope: p.id, message: `${d.name} has already ended` });
    }
    for (const l of p.expenses) {
      if (ENDED_DEBTS.includes(l.name)) issues.push({ scope: p.id, message: `${l.name} ended in September 2026` });
      if (l.until !== undefined && p.monthIndex > l.until) issues.push({ scope: p.id, message: `${l.name} has already ended` });
    }
  }
  for (const month of PLAN_MONTHS) {
    const ps = plan.paydays.filter((p) => p.month === month);
    const allocated = ps.reduce((s, p) => s + p.expenseTotal + p.debtTotal + p.taiwan + p.emergency + p.savings + p.excess, 0);
    if (ps.length !== PAYDAYS.length) issues.push({ scope: month, message: `${ps.length} paydays, expected ${PAYDAYS.length}` });
    if (total(ps, 'income') !== expectedMonthly || allocated !== expectedMonthly) {
      issues.push({ scope: month, message: `Income ${total(ps, 'income')} and allocated ${allocated} should both be ${expectedMonthly}` });
    }
  }
  if (plan.taiwanTotal < plan.target) issues.push({ scope: 'taiwan', message: `Taiwan reaches only ${plan.taiwanTotal} of ${plan.target}` });
  return issues;
}
