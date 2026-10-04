import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { FullNumbersTable } from '@/components/FullNumbersTable';
import { FundSummaryChart } from '@/components/FundSummaryChart';
import { Card, CategoryMark, ListRow } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScreenHeader } from '@/components/ui/Heading';
import { Icon } from '@/components/ui/Icon';
import { Meter } from '@/components/ui/ProgressBar';
import {
  combineQueryState,
  useCategories,
  useCategoryBalances,
  useCategoryBalancesThisMonth,
  useHouseholdMembers,
  useHouseholdMembership,
  useIncomes,
  usePaydayAmounts,
} from '@/lib/queries';
import { formatPeso } from '@/lib/format';
import {
  APP_START_DATE,
  daysUntil,
  incomeAmountForPayday,
  paydayAtOffset,
  startsNote,
  toDateOnly,
} from '@/lib/payday';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Ring({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, pct));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [clamped, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.value),
  }));

  return (
    <Svg
      width={46}
      height={46}
      viewBox="0 0 42 42"
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }}
    >
      <Circle cx={21} cy={21} r={r} fill="none" stroke={trackColor} strokeWidth={6} />
      <AnimatedCircle
        cx={21}
        cy={21}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="butt"
        strokeDasharray={c}
        animatedProps={animatedProps}
        rotation={-90}
        originX={21}
        originY={21}
      />
    </Svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { vars } = useTheme();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdId = member?.household_id;
  const membersQuery = useHouseholdMembers(householdId);
  const members = membersQuery.data;
  const categoriesQuery = useCategories(householdId);
  const categories = categoriesQuery.data;
  const categoriesLoading = categoriesQuery.isLoading;
  const balancesQuery = useCategoryBalances(householdId);
  const balances = balancesQuery.data;
  const balancesThisMonthQuery = useCategoryBalancesThisMonth(householdId);
  const balancesThisMonth = balancesThisMonthQuery.data;
  const incomesQuery = useIncomes(householdId);
  const incomes = incomesQuery.data;
  const paydayAmountsQuery = usePaydayAmounts(householdId);

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    membersQuery,
    categoriesQuery,
    balancesQuery,
    balancesThisMonthQuery,
    incomesQuery,
    paydayAmountsQuery,
  );

  const activeDays = useMemo(() => (incomes ?? []).filter((i) => i.active).map((i) => i.recurring_day), [incomes]);
  const [paydayOffset, setPaydayOffset] = useState(0);

  const payday = useMemo(() => {
    if (activeDays.length === 0) return null;
    const date = paydayAtOffset(activeDays, paydayOffset);
    const dateOnly = toDateOnly(date);
    const actualAmount = dateOnly < toDateOnly(new Date()) ? paydayAmountsQuery.data?.[dateOnly] : undefined;
    const amount = actualAmount ?? incomeAmountForPayday(incomes ?? [], date);
    // Nothing before October 2026 is ever shown, so stepping back stops there.
    const canGoBack = toDateOnly(paydayAtOffset(activeDays, paydayOffset - 1)) >= APP_START_DATE;
    return { date, amount, daysAway: daysUntil(date), canGoBack };
  }, [activeDays, incomes, paydayAmountsQuery.data, paydayOffset]);

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page" edges={[]}>
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (categoriesLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page" edges={[]}>
        <ActivityIndicator color={vars['--accent']} />
      </SafeAreaView>
    );
  }

  const setupSteps = [
    { label: 'Add your income', done: (incomes ?? []).length > 0, href: '/(app)/income' as const },
    { label: 'Add your categories', done: (categories ?? []).length > 0, href: '/(app)/categories' as const },
    { label: 'Invite your partner', done: (members ?? []).length > 1, href: '/(app)/settings' as const },
  ];
  const setupComplete = setupSteps.every((s) => s.done);
  // Every category shows, even one that hasn't started yet (it gets a "starts ..." note).
  const shownCategories = categories ?? [];

  return (
    <SafeAreaView className="flex-1 bg-page" edges={[]}>
      <ScrollView contentContainerClassName="gap-4 px-6 py-5" className="flex-1">
        {!setupComplete && (
          <Card className="gap-1 p-4">
            <View className="mb-2 flex-row items-center gap-3">
              <Ring
                pct={setupSteps.filter((s) => s.done).length / setupSteps.length}
                color={vars['--accent']}
                trackColor={vars['--surface-3']}
              />
              <View className="flex-1">
                <Text className="font-display text-md text-ink">Get set up</Text>
                <Text className="font-body text-xs text-ink-muted">
                  {setupSteps.filter((s) => s.done).length} of {setupSteps.length} steps done
                </Text>
              </View>
            </View>
            {setupSteps.map((step) => (
              <Pressable
                key={step.label}
                onPress={() => router.push(step.href)}
                className="flex-row items-center gap-3 py-2"
              >
                <Text
                  className={`flex-1 font-body text-sm ${step.done ? 'text-ink-muted line-through' : 'text-ink'}`}
                >
                  {step.label}
                </Text>
                {!step.done && <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />}
              </Pressable>
            ))}
          </Card>
        )}

        {/* One "leaf" block (a corner cut small) instead of a generic card. */}
        {payday && (
          <View className="flex-row items-center gap-3 rounded-lg rounded-tl-sm bg-accent-soft px-5 py-4">
            <Pressable
              accessibilityLabel="Previous payday"
              accessibilityRole="button"
              hitSlop={8}
              disabled={!payday.canGoBack}
              onPress={() => setPaydayOffset((offset) => offset - 1)}
              className={`h-9 w-9 items-center justify-center rounded-full bg-surface active:opacity-70 ${payday.canGoBack ? '' : 'opacity-40'}`}
            >
              <Icon name="chevronLeft" size={18} color={vars['--accent']} />
            </Pressable>
            <View className="flex-1">
              <Text className="font-body-semibold text-sm text-accent">
                {paydayOffset < 0 ? 'Previous payday' : paydayOffset === 0 ? 'Next payday' : 'Upcoming payday'} ·{' '}
                {payday.date.getDate()}th ·{' '}
                {payday.daysAway < 0
                  ? `${Math.abs(payday.daysAway)} day${payday.daysAway === -1 ? '' : 's'} ago`
                  : `in ${payday.daysAway} day${payday.daysAway === 1 ? '' : 's'}`}
              </Text>
              <Text className="font-mono text-xl text-ink">{formatPeso(payday.amount)}</Text>
            </View>
            <Pressable
              accessibilityLabel="Next payday"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setPaydayOffset((offset) => offset + 1)}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface active:opacity-70"
            >
              <Icon name="chevronRight" size={18} color={vars['--accent']} />
            </Pressable>
            <Button
              size="sm"
              onPress={() =>
                router.push({ pathname: '/(app)/checklist', params: { date: toDateOnly(payday.date) } })
              }
            >
              Review
            </Button>
          </View>
        )}

        <FundSummaryChart categories={shownCategories} balances={balances} />

        <View>
          <View className="mb-2">
            <ScreenHeader title="Category balances" />
          </View>
          {shownCategories.length === 0 && (
            <EmptyState>No categories yet — add one from the Categories tab.</EmptyState>
          )}
          {shownCategories.length > 0 && (
            <Card>
              {shownCategories.map((c, i) => {
                const balance = balances?.[c.id] ?? 0;
                const goal = c.rule?.type === 'goal' ? c.rule.target_amount : null;
                const target = goal ?? (c.rule?.type === 'capped_percent' ? c.rule.cap ?? null : null);
                return (
                  <ListRow
                    key={c.id}
                    isLast={i === shownCategories.length - 1}
                    onPress={() => router.push(`/(app)/categories/${c.id}`)}
                  >
                    <CategoryMark color={c.color} size={32} label={c.name} />
                    <View className="flex-1">
                      <Text className="font-body-semibold text-base text-ink">{c.name}</Text>
                      <Text className="mt-[2px] font-body text-xs text-ink-muted">
                        {c.kind === 'bill'
                          ? 'Recurring bills'
                          : goal
                            ? `Goal · ${formatPeso(goal)}`
                            : target != null
                              ? `Capped · ${formatPeso(target)}`
                              : 'No cap'}
                        {startsNote(c.start_month) ? ` · ${startsNote(c.start_month)}` : ''}
                      </Text>
                      {target != null && (
                        <Meter
                          thin
                          className="mt-[5px]"
                          percent={Math.min(1, Math.max(0, balance / target)) * 100}
                          color={c.color ?? vars['--ink-muted']}
                        />
                      )}
                    </View>
                    <Text className="font-mono text-sm text-ink">
                      {c.kind === 'fund'
                        ? formatPeso(balance)
                        : `${formatPeso(balancesThisMonth?.[c.id] ?? 0)} this month`}
                    </Text>
                    <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />
                  </ListRow>
                );
              })}
            </Card>
          )}
        </View>

        <FullNumbersTable onExpand={() => router.push('/(app)/cashflow')} />
      </ScrollView>
    </SafeAreaView>
  );
}
