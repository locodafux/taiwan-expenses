// Mirrors supabase/migrations/20260913000004_allocation.sql's
// clamp_day_to_month / next_payday - the client needs the same "what's the
// next payday" answer to know which date to materialize/display without a
// round trip for every render.
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

export function nextPayday(recurringDays: number[], from: Date = new Date()): Date {
  const uniqueDays = Array.from(new Set(recurringDays));
  if (uniqueDays.length === 0) throw new Error('No active incomes to compute a payday from');

  const fromMonthStart = new Date(from.getFullYear(), from.getMonth(), 1);
  const nextMonthStart = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const fromDateOnly = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  const candidates = [
    ...uniqueDays.map((d) => clampDayToMonth(d, fromMonthStart)),
    ...uniqueDays.map((d) => clampDayToMonth(d, nextMonthStart)),
  ].filter((d) => d.getTime() >= fromDateOnly.getTime());

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
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

type IncomeLike = { amount: number; recurring_day: number; active: boolean };
type BillLike = { amount: number; recurring_day: number; end_date: string | null };

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

// First of the month a date-only string falls in, as another date-only
// string - the shape category_month_skips.month is constrained to.
export function monthStart(dateOnly: string): string {
  return `${dateOnly.slice(0, 7)}-01`;
}

// Loan/bill payment terms (captain's bug report, 2026-09-20). The term is
// stored as bill_items.end_date = the last due date; materialize_payday and
// leftoverByPaydayInMonth already stop a bill once its end_date has passed.
function dueDates(recurringDay: number, from: Date): () => Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let offset = clampDayToMonth(recurringDay, today) < today ? 1 : 0;
  return () => clampDayToMonth(recurringDay, new Date(today.getFullYear(), today.getMonth() + offset++, 1));
}

// End date for a term of `payments` monthly payments, counting the next due
// date on/after `from` as the first one.
export function termEndDate(recurringDay: number, payments: number, from: Date = new Date()): string {
  const next = dueDates(recurringDay, from);
  let d = next();
  for (let i = 1; i < payments; i++) d = next();
  return toDateOnly(d);
}

// Due dates still ahead (today included) up to and including end_date.
export function paymentsLeft(recurringDay: number, endDate: string, from: Date = new Date()): number {
  const end = fromDateOnly(endDate);
  const next = dueDates(recurringDay, from);
  let n = 0;
  while (next() <= end) n++;
  return n;
}
