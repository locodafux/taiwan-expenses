import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, CategoryMark, ListRow } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatPeso } from '@/lib/format';
import { appToday, fromDateOnly, monthsBetween, toDateOnly } from '@/lib/payday';
import {
  combineQueryState,
  useCategories,
  useCategoryBalances,
  useFundTotalsForecast,
  useHouseholdMembership,
} from '@/lib/queries';
import type { Category } from '@/lib/database.types';
import { useTheme } from '@/theme/ThemeProvider';

// "Where the plan lands" (taiwan-fund-planner.html:239-244): projected
// END-STATE totals per category, not today's balances (captain's decision,
// held under taiwan-expenses-monthly-breakdown-decisions). A fund's end date
// is its own goal deadline, or - for funds with no deadline of their own
// (capped/remainder/undated goals) - the household's furthest goal deadline,
// same horizon private.goal_plan already uses. A fund with neither, a linked
// group/excess child (private.fund_totals_plan doesn't project those), and
// every bill category degrade to showing their current balance instead.
function monthLabel(month: string) {
  return fromDateOnly(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function goalHorizonEndMonth(categories: Category[]): string | undefined {
  const targets = categories
    .filter((c) => c.kind === 'fund' && c.rule?.type === 'goal' && c.rule.target_date)
    .map((c) => (c.rule as { target_date: string }).target_date.slice(0, 7));
  return targets.length ? targets.reduce((a, b) => (b > a ? b : a)) : undefined;
}

function endMonthFor(c: Category, horizonEnd: string | undefined): string | undefined {
  if (c.kind !== 'fund') return undefined;
  const rule = c.rule;
  if (!rule || rule.type === 'excess' || rule.type === 'group_child') return undefined;
  if (rule.type === 'goal' && rule.target_date) return rule.target_date.slice(0, 7);
  return horizonEnd;
}

function captionFor(c: Category, endMonth: string | undefined, endState: number, categories: Category[]): string {
  if (c.kind === 'bill') return 'Paid to date';
  const rule = c.rule;
  if (rule?.type === 'excess' || rule?.type === 'group_child') {
    const parent = categories.find((p) => p.id === rule.parent_id);
    return `Linked to ${parent?.name ?? 'parent'} · current balance`;
  }
  if (!endMonth) return 'No deadline set · current balance';
  const label = `by ${monthLabel(endMonth)}`;
  if (rule?.type === 'goal') {
    if (endState >= rule.target_amount) return `Complete · target ₱${rule.target_amount.toLocaleString()}`;
    return `${rule.one_time ? 'Ready' : 'Projected'} ${label}`;
  }
  return `Projected ${label}`;
}

export default function SummaryOfAll() {
  const { vars } = useTheme();
  const router = useRouter();
  const membershipQuery = useHouseholdMembership();
  const householdId = membershipQuery.data?.household_id;

  const currentMonth = toDateOnly(appToday()).slice(0, 7);
  const categoriesQuery = useCategories(householdId, { includeArchived: true });
  const balancesQuery = useCategoryBalances(householdId);

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const horizonEnd = useMemo(() => goalHorizonEndMonth(categories), [categories]);
  // Clamped to fund_totals_forecast's own p_months <= 36 limit - a goal
  // dated further out just under-counts its tail rather than erroring.
  const monthsNeeded = horizonEnd ? Math.min(36, Math.max(1, monthsBetween(currentMonth, horizonEnd) + 1)) : 0;
  const forecastQuery = useFundTotalsForecast(householdId, currentMonth, monthsNeeded);

  const { isError, refetch } = combineQueryState(membershipQuery, categoriesQuery, balancesQuery, forecastQuery);
  const isLoading =
    membershipQuery.isLoading || categoriesQuery.isLoading || balancesQuery.isLoading ||
    (monthsNeeded > 0 && forecastQuery.isLoading);

  // category_id -> cumulative contribution by month_index (1 = currentMonth),
  // so each category can sum only up to its OWN end month even though every
  // category shares one forecast call sized to the household's furthest one.
  const forecastByCategory = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    for (const row of forecastQuery.data ?? []) {
      (map[row.category_id] ??= {})[row.month_index] = row.amount;
    }
    return map;
  }, [forecastQuery.data]);

  const balances = balancesQuery.data ?? {};

  function endStateFor(c: Category): { amount: number; endMonth: string | undefined } {
    const balance = balances[c.id] ?? 0;
    const endMonth = endMonthFor(c, horizonEnd);
    if (!endMonth) return { amount: balance, endMonth: undefined };
    const monthCount = Math.max(1, monthsBetween(currentMonth, endMonth) + 1);
    const byMonth = forecastByCategory[c.id] ?? {};
    let projected = 0;
    for (let m = 1; m <= monthCount; m++) projected += byMonth[m] ?? 0;
    return { amount: balance + projected, endMonth };
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
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
      <ScrollView contentContainerClassName="gap-4 px-6 py-5" className="flex-1">
        <Pressable
          onPress={() => router.navigate('/(app)/settings')}
          hitSlop={13}
          accessibilityRole="button"
          className="-mb-1 self-start py-1"
        >
          <Text className="font-body text-sm text-ink-2">‹ Settings</Text>
        </Pressable>
        <Text className="font-display-semibold text-lg text-ink">Summary of all</Text>

        <Card>
          {categories.map((c, i) => {
            const { amount, endMonth } = endStateFor(c);
            return (
              <ListRow key={c.id} isLast={i === categories.length - 1}>
                <CategoryMark color={c.color} size={32} label={c.name} />
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 font-body-semibold text-base text-ink" numberOfLines={1}>
                      {c.name}
                      {c.archived ? ' · Archived' : ''}
                    </Text>
                    <Text className="font-mono text-sm text-ink">{formatPeso(amount)}</Text>
                  </View>
                  <Text className="mt-[2px] font-body text-xs text-ink-muted">
                    {captionFor(c, endMonth, amount, categories)}
                  </Text>
                </View>
              </ListRow>
            );
          })}
          {categories.length === 0 && (
            <Text className="p-4 font-body text-sm text-ink-muted">No categories yet.</Text>
          )}
        </Card>

        <Text className="font-body text-xs leading-[1.5] text-ink-muted">
          Bills show what&apos;s been paid to date. Funds show where they&apos;re projected to land: a fund with its
          own goal date uses that date, other funds use the household&apos;s furthest goal date, and a fund with no
          goal anywhere in the household - or one linked to a parent fund&apos;s payday share - just shows its
          current balance.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
