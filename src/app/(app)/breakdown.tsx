import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { vars as nativeWindVars } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaydayCalendar } from '@/components/PaydayCalendar';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon } from '@/components/ui/Icon';
import { formatPeso } from '@/lib/format';
import { addMonths, APP_START_MONTH, appToday, fromDateOnly, scheduledMonthTotal, toDateOnly } from '@/lib/payday';
import {
  combineQueryState,
  useCategories,
  useFundTotalsForecast,
  useHouseholdBillItems,
  useHouseholdMembership,
  useIncomes,
  useMonthlyLedgerTotals,
} from '@/lib/queries';
import type { Category } from '@/lib/database.types';
import { useTheme } from '@/theme/ThemeProvider';
import { PAYDAY_PINK } from '@/theme/tokens';

// Mirrors taiwan-fund-planner.html's "Full numbers" table: one row per
// month, one column per category, real history behind today and a forward
// projection ahead of it (private.fund_totals_plan,
// 20260927000001_fund_totals_projection.sql). ponytail: no sticky header/
// first column (plain horizontal ScrollView) and a fixed 12-month page
// rather than an infinite one - add either if a household finds this window
// too small to be useful.
const PAST_MONTHS = 3;
const WINDOW_SIZE = 12;
const CELL_W = 108;
const MONTH_W = 84;

function monthLabel(month: string) {
  return fromDateOnly(`${month}-01`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

// Soft-pink theme scope for the payday calendar view (see PAYDAY_PINK).
const PINK_SCOPE = nativeWindVars(PAYDAY_PINK);

type BreakdownView = 'calendar' | 'table';

// Payday calendar (fixed plan, no queries) or the month-by-month table of the
// household's real data; the calendar is the main view.
function ViewToggle({ value, onChange }: { value: BreakdownView; onChange: (v: BreakdownView) => void }) {
  return (
    <View className="flex-row gap-1 self-start rounded-pill bg-surface-2 p-1">
      {(['calendar', 'table'] as const).map((v) => (
        <Pressable
          key={v}
          onPress={() => onChange(v)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === v }}
          className={`rounded-pill px-4 py-2 ${value === v ? 'bg-surface' : ''}`}
        >
          <Text className={`font-body-semibold text-sm ${value === v ? 'text-ink' : 'text-ink-muted'}`}>
            {v === 'calendar' ? 'Payday calendar' : 'Month table'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Breakdown() {
  const [view, setView] = useState<BreakdownView>('calendar');
  const router = useRouter();
  const toggle = <ViewToggle value={view} onChange={setView} />;
  if (view === 'table') return <MonthTable toggle={toggle} />;
  return (
    <SafeAreaView style={PINK_SCOPE} className="flex-1 bg-page" edges={['top']}>
      <View className="gap-3 px-6 pb-2 pt-3">
        <Pressable
          onPress={() => router.navigate('/(app)/settings')}
          hitSlop={13}
          accessibilityRole="button"
          className="self-start py-3"
        >
          <Text className="font-body text-sm text-ink-2">‹ Settings</Text>
        </Pressable>
        <Text className="font-display-semibold text-lg text-ink">Breakdown</Text>
        {toggle}
      </View>
      <PaydayCalendar />
    </SafeAreaView>
  );
}

function MonthTable({ toggle }: { toggle: React.ReactNode }) {
  const { vars } = useTheme();
  const router = useRouter();
  const membershipQuery = useHouseholdMembership();
  const householdId = membershipQuery.data?.household_id;

  const currentMonth = toDateOnly(appToday()).slice(0, 7);
  // Nothing before October 2026 is ever listed, so the window never pages earlier.
  const clampStart = (m: string) => (m < APP_START_MONTH ? APP_START_MONTH : m);
  const [windowStart, setWindowStart] = useState(() => clampStart(addMonths(currentMonth, -PAST_MONTHS)));
  const months = useMemo(
    () => Array.from({ length: WINDOW_SIZE }, (_, i) => addMonths(windowStart, i)),
    [windowStart],
  );
  const forecastMonths = months.filter((m) => m >= currentMonth);

  const categoriesQuery = useCategories(householdId);
  const billItemsQuery = useHouseholdBillItems(householdId);
  const incomesQuery = useIncomes(householdId);
  // All history since the app's start, not just this window: a linked child's
  // goal room below is target minus everything already checked.
  const ledgerQuery = useMonthlyLedgerTotals(householdId, APP_START_MONTH);
  const forecastQuery = useFundTotalsForecast(householdId, forecastMonths[0], forecastMonths.length);

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    categoriesQuery,
    billItemsQuery,
    incomesQuery,
    ledgerQuery,
    forecastQuery,
  );
  const isLoading =
    membershipQuery.isLoading ||
    categoriesQuery.isLoading ||
    billItemsQuery.isLoading ||
    incomesQuery.isLoading ||
    ledgerQuery.isLoading ||
    (forecastMonths.length > 0 && forecastQuery.isLoading);

  const categories = categoriesQuery.data ?? [];
  const billItemsByCategory = useMemo(() => {
    const map: Record<string, { amount: number; recurring_day: number; end_date: string | null }[]> = {};
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
          ? [{ id: c.id, percent: c.rule.percent, goal: c.rule.type === 'group_child' ? c.rule.goal : undefined }]
          : [],
      );
      const rooms = kids.map((k) => {
        if (!k.goal) return Infinity;
        const checked = Object.values(ledgerTotals).reduce((sum, byCat) => sum + (byCat[k.id] ?? 0), 0);
        return Math.max(0, k.goal.target_amount - checked);
      });
      const weightSum = kids.reduce((sum, k) => sum + k.percent, 0);
      for (const month of forecastMonths) {
        const pool = forecastByMonth[month]?.[parentId] ?? 0;
        const total = pool > 0 ? (pool * weightSum) / 100 : 0;
        const shares = kids.map((k) => Math.round((total * k.percent) / weightSum));
        // Rounding residue goes to the heaviest child (first on a tie), like allocate_proportional.
        const heaviest = kids.reduce((best, k, i) => (k.percent > kids[best].percent ? i : best), 0);
        shares[heaviest] += Math.round(total) - shares.reduce((a, b) => a + b, 0);
        let given = 0;
        kids.forEach((k, i) => {
          const share = Math.min(shares[i], rooms[i]);
          rooms[i] -= share;
          given += share;
          (out[month] ??= {})[k.id] = share;
        });
        (out[month] ??= {})[parentId] = pool - given;
      }
    }
    return out;
  })();

  function cellValue(category: Category, month: string): number {
    const monthStart = fromDateOnly(`${month}-01`);
    if (category.kind === 'bill') {
      return scheduledMonthTotal(billItemsByCategory[category.id] ?? [], monthStart);
    }
    const historical = ledgerTotals[month]?.[category.id];
    if (historical !== undefined) return historical;
    if (month < currentMonth) return 0;
    return groupProjection[month]?.[category.id] ?? forecastByMonth[month]?.[category.id] ?? 0;
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <View className="px-6 pt-3">{toggle}</View>
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color={vars['--accent']} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <View className="gap-3 px-6 pt-3">
        <Pressable
          onPress={() => router.navigate('/(app)/settings')}
          hitSlop={13}
          accessibilityRole="button"
          className="self-start py-3"
        >
          <Text className="font-body text-sm text-ink-2">‹ Settings</Text>
        </Pressable>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-display-semibold text-lg text-ink">Breakdown</Text>
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => setWindowStart((s) => clampStart(addMonths(s, -WINDOW_SIZE)))}
              disabled={windowStart <= APP_START_MONTH}
              accessibilityLabel="Earlier months"
              hitSlop={10}
              accessibilityRole="button"
              className={`p-2 ${windowStart <= APP_START_MONTH ? 'opacity-40' : ''}`}
            >
              <Icon name="chevronLeft" size={18} color={vars['--ink-2']} />
            </Pressable>
            <Text className="font-body text-sm text-ink-muted">
              {monthLabel(months[0])} – {monthLabel(months[months.length - 1])}
            </Text>
            <Pressable
              onPress={() => setWindowStart((s) => addMonths(s, WINDOW_SIZE))}
              accessibilityLabel="Later months"
              hitSlop={10}
              accessibilityRole="button"
              className="p-2"
            >
              <Icon name="chevronRight" size={18} color={vars['--ink-2']} />
            </Pressable>
          </View>
        </View>
        {toggle}
      </View>

      <ScrollView horizontal contentContainerClassName="px-6 py-4">
        <View>
          <View className="flex-row border-b border-gridline pb-2">
            <View style={{ width: MONTH_W }} />
            <View style={{ width: CELL_W }}>
              <Text className="text-right font-body-semibold text-xs text-ink">Income</Text>
            </View>
            {categories.map((c) => (
              <View key={c.id} style={{ width: CELL_W }}>
                <Text numberOfLines={1} style={{ color: c.color ?? vars['--ink'] }} className="text-right font-body-semibold text-xs">
                  {c.name}
                </Text>
              </View>
            ))}
            <View style={{ width: CELL_W }}>
              <Text className="text-right font-body-semibold text-xs text-ink">Total</Text>
            </View>
          </View>

          {months.map((month) => {
            const monthStart = fromDateOnly(`${month}-01`);
            const income = scheduledMonthTotal(incomesQuery.data ?? [], monthStart);
            const values = categories.map((c) => cellValue(c, month));
            const total = categories.reduce((sum, c, i) => (c.kind === 'fund' ? sum + values[i] : sum), 0);
            return (
              <View
                key={month}
                className={`flex-row items-center py-2 ${month === currentMonth ? 'bg-surface' : ''}`}
              >
                <View style={{ width: MONTH_W }}>
                  <Text className="font-body-semibold text-xs text-ink">{monthLabel(month)}</Text>
                </View>
                <View style={{ width: CELL_W }}>
                  <Text className="text-right font-body text-xs text-ink-2">{formatPeso(income)}</Text>
                </View>
                {categories.map((c, i) => (
                  <View key={c.id} style={{ width: CELL_W }}>
                    <Text className="text-right font-body text-xs text-ink-2">{formatPeso(values[i])}</Text>
                  </View>
                ))}
                <View style={{ width: CELL_W }}>
                  <Text className="text-right font-body-semibold text-xs text-ink">{formatPeso(total)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <Text className="px-6 pb-4 font-body text-xs leading-[1.5] text-ink-muted">
        Months before today are your real checked history; {monthLabel(currentMonth)} onward is projected from your
        current rules. A linked fund shows its share of its parent fund’s projected month; the parent shows the rest.
      </Text>
    </SafeAreaView>
  );
}
