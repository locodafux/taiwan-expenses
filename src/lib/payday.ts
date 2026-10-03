// Mirrors supabase/migrations/20260913000004_allocation.sql's
// clamp_day_to_month / next_payday - the client needs the same "what's the
// next payday" answer to know which date to materialize/display without a
// round trip for every render.
// The app starts in October 2026 (captain's call): nothing before it is ever
// shown or selectable, even while the real date is still in September. Every
// "today" that feeds a displayed window goes through appToday() so it can
// never resolve to an earlier date.
export const APP_START_DATE = '2026-10-01';
export const APP_START_MONTH = APP_START_DATE.slice(0, 7);
export function appToday(now: Date = new Date()): Date {
  const start = new Date(2026, 9, 1);
  return now < start ? start : now;
}

export function clampDayToMonth(day: number, monthStart: Date): Date {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

// Local calendar date, not the UTC instant - toISOString() would shift the
// date near midnight in any timezone ahead of/behind UTC.
export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Inverse of toDateOnly - `new Date("YYYY-MM-DD")` parses as UTC midnight,
// which getDate()/getMonth() then read back shifted by a day in any
// timezone behind UTC. Construct the local Date directly instead.
export function fromDateOnly(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Nov 2026" when the category hasn't started yet (relative to appToday), else null.
export function startsNote(startMonth: string): string | null {
  if (startMonth.slice(0, 7) <= toDateOnly(appToday()).slice(0, 7)) return null;
  return `starts ${fromDateOnly(startMonth).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

export function nextPayday(recurringDays: number[], from: Date = appToday()): Date {
  return paydayAtOffset(recurringDays, 0, from);
}

// Finds a payday relative to the next one (0 = next, -1 = previous, 1 = the
// one after next). Dates are generated from calendar months so recurring days
// that fall on a short month stay clamped in the same way as nextPayday.
export function paydayAtOffset(recurringDays: number[], offset: number, from: Date = appToday()): Date {
  const uniqueDays = Array.from(new Set(recurringDays));
  if (uniqueDays.length === 0) throw new Error('No active incomes to compute a payday from');

  const fromDateOnly = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const firstMonthOffset = Math.min(offset, 0) - 1;
  const lastMonthOffset = Math.max(offset, 0) + 1;
  const candidates: Date[] = [];

  for (let monthOffset = firstMonthOffset; monthOffset <= lastMonthOffset; monthOffset++) {
    const monthStart = new Date(from.getFullYear(), from.getMonth() + monthOffset, 1);
    candidates.push(...uniqueDays.map((day) => clampDayToMonth(day, monthStart)));
  }

  const uniqueCandidates = Array.from(new Map(candidates.map((date) => [toDateOnly(date), date])).values()).sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  const nextIndex = uniqueCandidates.findIndex((date) => date.getTime() >= fromDateOnly.getTime());
  return uniqueCandidates[nextIndex + offset];
}

export function daysUntil(target: Date, from: Date = new Date()): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// How many consecutive paydays (most recent first, including the current
// one) had every ledger entry checked - the celebration card's streak line.
// `rows` only needs to cover payday_date < currentPaydayDate; the current
// payday itself is assumed complete (the celebration only renders once it
// is) so its status doesn't depend on the query having refetched yet.
export function completedPaydayStreak(
  rows: { payday_date: string; status: string }[],
  currentPaydayDate: string,
): number {
  const complete = new Map<string, boolean>();
  for (const r of rows) {
    complete.set(r.payday_date, (complete.get(r.payday_date) ?? true) && r.status === 'checked');
  }
  complete.set(currentPaydayDate, true);

  const dates = [...complete.keys()].sort().reverse();
  let streak = 0;
  for (const d of dates) {
    if (!complete.get(d)) break;
    streak++;
  }
  return streak;
}

export type IncomeLike = { amount: number; recurring_day: number; active: boolean };
type BillLike = { amount: number; recurring_day: number; end_date: string | null };

// The projected pay for one payday, including incomes whose recurring day is
// clamped into a shorter month (for example, the 31st in February).
export function incomeAmountForPayday(incomes: IncomeLike[], paydayDate: Date): number {
  const monthStart = new Date(paydayDate.getFullYear(), paydayDate.getMonth(), 1);
  return incomes
    .filter(
      (income) =>
        income.active && clampDayToMonth(income.recurring_day, monthStart).getDate() === paydayDate.getDate(),
    )
    .reduce((sum, income) => sum + income.amount, 0);
}

// Mirrors private.payday_leftover: that payday's income minus bills/debts due
// the same day, for every active payday in the given month - the basis for
// the checklist's "cut advice" callout (docs/plan.md §3).
export function leftoverByPaydayInMonth(
  incomes: IncomeLike[],
  bills: BillLike[],
  monthStart: Date,
): { day: number; leftover: number }[] {
  const activeDays = Array.from(new Set(incomes.filter((i) => i.active).map((i) => i.recurring_day)));
  return activeDays
    .map((day) => clampDayToMonth(day, monthStart).getDate())
    .filter((day, i, arr) => arr.indexOf(day) === i)
    .map((day) => {
      const income = incomes
        .filter((i) => i.active && clampDayToMonth(i.recurring_day, monthStart).getDate() === day)
        .reduce((s, i) => s + i.amount, 0);
      const billTotal = bills
        .filter((b) => {
          if (clampDayToMonth(b.recurring_day, monthStart).getDate() !== day) return false;
          if (!b.end_date) return true;
          return fromDateOnly(b.end_date) >= clampDayToMonth(day, monthStart);
        })
        .reduce((s, b) => s + b.amount, 0);
      return { day, leftover: income - billTotal };
    })
    .sort((a, b) => a.day - b.day);
}

// Loan/bill payment terms (captain's bug report, 2026-09-20). The term is
// stored as bill_items.end_date = the last due date; materialize_payday and
// leftoverByPaydayInMonth already stop a bill once its end_date has passed.
function dueDates(recurringDay: number, from: Date): () => Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let offset = clampDayToMonth(recurringDay, today) < today ? 1 : 0;
  return () => clampDayToMonth(recurringDay, new Date(today.getFullYear(), today.getMonth() + offset++, 1));
}

// End date for a bill whose last payment falls in `month` ('YYYY-MM'):
// that month's due date, clamped to the month's length.
export function monthDueDate(recurringDay: number, month: string): string {
  return toDateOnly(clampDayToMonth(recurringDay, fromDateOnly(`${month}-01`)));
}

// Next calendar month as 'YYYY-MM' - the earliest goal deadline worth
// offering, since the engine saves through the month before the deadline.
export function nextMonth(from: Date = appToday()): string {
  return toDateOnly(new Date(from.getFullYear(), from.getMonth() + 1, 1)).slice(0, 7);
}

// Due dates still ahead (today included) up to and including end_date.
export function paymentsLeft(recurringDay: number, endDate: string, from: Date = appToday()): number {
  const end = fromDateOnly(endDate);
  const next = dueDates(recurringDay, from);
  let n = 0;
  while (next() <= end) n++;
  return n;
}

// 'YYYY-MM' shifted by n calendar months (negative goes back) - the
// breakdown table's window paging.
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  return toDateOnly(new Date(y, m - 1 + n, 1)).slice(0, 7);
}

// Calendar months from `from` to `to` ('YYYY-MM' each) - the summary
// screen's "how many months of forecast do I need" sizing.
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// A schedule's (income or bill_items) total across every active payday in
// monthStart's month - the breakdown table's per-category Income/bill
// columns, always schedule-based (there's no "income received" ledger to
// read back for past months, and a scheduled bill is due whether checked off
// yet or not).
export function scheduledMonthTotal(
  items: { amount: number; recurring_day: number; active?: boolean; end_date?: string | null }[],
  monthStart: Date,
): number {
  const activeItems = items.filter((i) => i.active !== false);
  const days = Array.from(new Set(activeItems.map((i) => clampDayToMonth(i.recurring_day, monthStart).getDate())));
  return days.reduce((sum, day) => {
    const dayDate = clampDayToMonth(day, monthStart);
    const dueThatDay = activeItems.filter((i) => {
      if (clampDayToMonth(i.recurring_day, monthStart).getDate() !== day) return false;
      return !i.end_date || fromDateOnly(i.end_date) >= dayDate;
    });
    return sum + dueThatDay.reduce((s, i) => s + i.amount, 0);
  }, 0);
}

// Whether a category runs in `month` ('YYYY-MM'): from its start_month
// ('YYYY-MM-01') onward. The end_month column is unused (every category is
// ongoing); private.category_in_range still honours it if one is ever set.
export function categoryActiveInMonth(category: { start_month: string }, month: string): boolean {
  return month >= category.start_month.slice(0, 7);
}

// What is left of a group's 100% in `month` ('YYYY-MM') while one child takes
// `ownPercent`: the siblings already started that month each take their
// override ('YYYY-MM' key in `overrides`: `${id}:${month}`) or default, and
// what is left stays in the group's parent. Siblings not started yet take
// nothing (mirrors private.group_month_total).
export function groupMonthLeft(
  month: string,
  ownPercent: number,
  siblings: { id: string; name: string; start_month: string; percent: number }[],
  overrides: Map<string, number>,
) {
  const counted = siblings
    .filter((s) => categoryActiveInMonth(s, month))
    .map((s) => ({ name: s.name, percent: overrides.get(`${s.id}:${month}`) ?? s.percent }));
  const waiting = siblings.filter((s) => !categoryActiveInMonth(s, month));
  return {
    left: 100 - ownPercent - counted.reduce((sum, s) => sum + s.percent, 0),
    counted,
    waiting,
  };
}
