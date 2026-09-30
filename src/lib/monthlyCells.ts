import { useMemo } from 'react';

import type { Category } from '@/lib/database.types';
import {
  APP_START_MONTH,
  appToday,
  categoryActiveInMonth,
  fromDateOnly,
  scheduledMonthTotal,
  toDateOnly,
} from '@/lib/payday';
import {
  combineQueryState,
  useCategories,
  useFundTotalsForecast,
  useHouseholdBillItems,
  useHouseholdMembership,
  useMonthlyLedgerTotals,
} from '@/lib/queries';

type BillItemLike = { amount: number; recurring_day: number; end_date: string | null };

// Every category's amount for each month in `months` ('YYYY-MM', contiguous and
// ascending): real checked history for past months, a projection from today on
// (private.fund_totals_plan), and a bill category's schedule. Shared by the
// Breakdown month chart and the Full numbers table so both read one calculation.
export function useMonthlyCells(months: string[]) {
  const membershipQuery = useHouseholdMembership();
  const householdId = membershipQuery.data?.household_id;
  const currentMonth = toDateOnly(appToday()).slice(0, 7);
  const forecastMonths = useMemo(() => months.filter((m) => m >= currentMonth), [months, currentMonth]);

  const categoriesQuery = useCategories(householdId);
  const billItemsQuery = useHouseholdBillItems(householdId);
  // All history since the app's start, not just this window: a linked child's
  // goal room below is target minus everything already checked.
  const ledgerQuery = useMonthlyLedgerTotals(householdId, APP_START_MONTH);
  const forecastQuery = useFundTotalsForecast(householdId, forecastMonths[0], forecastMonths.length);

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    categoriesQuery,
    billItemsQuery,
    ledgerQuery,
    forecastQuery,
  );
  const isLoading =
    membershipQuery.isLoading ||
    categoriesQuery.isLoading ||
    billItemsQuery.isLoading ||
    ledgerQuery.isLoading ||
    (forecastMonths.length > 0 && forecastQuery.isLoading);

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const billItemsByCategory = useMemo(() => {
    const map: Record<string, BillItemLike[]> = {};
    for (const item of billItemsQuery.data ?? []) {
      (map[item.category_id] ??= []).push(item);
    }
    return map;
  }, [billItemsQuery.data]);

  const forecastByMonth = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const row of forecastQuery.data ?? []) {
      const month = forecastMonths[row.month_index - 1];
      if (!month) continue;
      (map[month] ??= {})[row.category_id] = row.amount;
    }
    return map;
  }, [forecastQuery.data, forecastMonths]);

  const ledgerTotals = ledgerQuery.data ?? {};

  // Each group parent's projected pool, split the way private.
  // excess_group_allocations splits a payday: children take their percentages
  // (capped by their goal's remaining room, carried month to month) and the
  // parent keeps the rest. Done on the monthly pool, so it can differ by a peso
  // from summing per-payday rounding. Only projected months are filled in.
  const groupProjection = (() => {
    const out: Record<string, Record<string, number>> = {};
    const parentIds = new Set<string>();
    for (const c of categories) {
      if (c.rule?.type === 'excess' || c.rule?.type === 'group_child') parentIds.add(c.rule.parent_id);
    }
    for (const parentId of parentIds) {
      const kids = categories.flatMap((c) =>
        (c.rule?.type === 'excess' || c.rule?.type === 'group_child') && c.rule.parent_id === parentId
          ? [{ id: c.id, category: c, percent: c.rule.percent, goal: c.rule.type === 'group_child' ? c.rule.goal : undefined }]
          : [],
      );
      const rooms = kids.map((k) => {
        if (!k.goal) return Infinity;
        const checked = Object.values(ledgerTotals).reduce((sum, byCat) => sum + (byCat[k.id] ?? 0), 0);
        return Math.max(0, k.goal.target_amount - checked);
      });
      for (const month of forecastMonths) {
        const pool = forecastByMonth[month]?.[parentId] ?? 0;
        // A linked fund outside its start/end months takes no share (private.excess_group_allocations).
        const live = kids.map((k, i) => i).filter((i) => categoryActiveInMonth(kids[i].category, month));
        const weightSum = live.reduce((sum, i) => sum + kids[i].percent, 0);
        const total = pool > 0 ? (pool * weightSum) / 100 : 0;
        const shares = kids.map((k) => (weightSum > 0 ? Math.round((total * k.percent) / weightSum) : 0));
        // Rounding residue goes to the heaviest child (first on a tie), like allocate_proportional.
        const heaviest = live.reduce((best, i) => (kids[i].percent > kids[best].percent ? i : best), live[0] ?? 0);
        if (live.length > 0) shares[heaviest] += Math.round(total) - live.reduce((a, i) => a + shares[i], 0);
        let given = 0;
        for (const i of live) {
          const share = Math.min(shares[i], rooms[i]);
          rooms[i] -= share;
          given += share;
          (out[month] ??= {})[kids[i].id] = share;
        }
        (out[month] ??= {})[parentId] = pool - given;
      }
    }
    return out;
  })();

  function cellValue(category: Category, month: string): number {
    const monthStart = fromDateOnly(`${month}-01`);
    if (category.kind === 'bill') {
      if (!categoryActiveInMonth(category, month)) return 0;
      return scheduledMonthTotal(billItemsByCategory[category.id] ?? [], monthStart);
    }
    const historical = ledgerTotals[month]?.[category.id];
    if (historical !== undefined) return historical;
    if (month < currentMonth || !categoryActiveInMonth(category, month)) return 0;
    return groupProjection[month]?.[category.id] ?? forecastByMonth[month]?.[category.id] ?? 0;
  }

  return { isLoading, isError, refetch, categories, billItemsByCategory, cellValue, currentMonth };
}
