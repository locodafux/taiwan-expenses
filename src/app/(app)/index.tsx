import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CategoryMark, ListRow } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SectionLabel } from '@/components/ui/Heading';
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
  usePaydayStreak,
  useSavedThisQuarter,
} from '@/lib/queries';
import { formatPeso } from '@/lib/format';
import { daysUntil, incomeAmountForPayday, paydayAtOffset, toDateOnly } from '@/lib/payday';
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
  const savedThisQuarterQuery = useSavedThisQuarter(householdId);
  const savedThisQuarter = savedThisQuarterQuery.data;
  const streakQuery = usePaydayStreak(householdId);
  const streak = streakQuery.data;

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    membersQuery,
    categoriesQuery,
    balancesQuery,
    balancesThisMonthQuery,
    incomesQuery,
    paydayAmountsQuery,
    savedThisQuarterQuery,
    streakQuery,
  );

  const activeDays = useMemo(() => (incomes ?? []).filter((i) => i.active).map((i) => i.recurring_day), [incomes]);
  const [paydayOffset, setPaydayOffset] = useState(0);

  const payday = useMemo(() => {
    if (activeDays.length === 0) return null;
    const date = paydayAtOffset(activeDays, paydayOffset);
    const dateOnly = toDateOnly(date);
    const actualAmount = dateOnly < toDateOnly(new Date()) ? paydayAmountsQuery.data?.[dateOnly] : undefined;
    const amount = actualAmount ?? incomeAmountForPayday(incomes ?? [], date);
    return { date, amount, daysAway: daysUntil(date) };
  }, [activeDays, incomes, paydayAmountsQuery.data, paydayOffset]);

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (categoriesLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page">
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
  const showMomentum = savedThisQuarter !== undefined && streak !== undefined;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 px-6 py-5" className="flex-1">
        <View className="flex-row items-center gap-3">
          <View className="flex-row">
            {(members ?? []).slice(0, 2).map((m, i) => (
              <Avatar
                key={m.id}
                initial={m.display_name[0]?.toUpperCase() ?? '?'}
                color={m.color ?? vars['--accent']}
                size={30}
                style={i > 0 ? { marginLeft: -10, borderWidth: 2, borderColor: vars['--surface'] } : undefined}
              />
            ))}
          </View>
          <View className="flex-1">
            <Text className="font-body-medium text-sm text-ink-muted">
              Hi {(members ?? []).map((m) => m.display_name).join(' & ')}
            </Text>
            <Text className="font-display text-xl text-ink">Our household</Text>
          </View>
        </View>

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

        {/* Two "leaf" blocks (one corner cut small) instead of a generic card. */}
        {showMomentum && (
          <View className="gap-1 rounded-lg rounded-bl-sm bg-sage-soft px-5 py-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="font-body-semibold text-sm text-accent-2">Saved this quarter</Text>
              <View className="flex-row items-center gap-1 rounded-pill bg-surface px-3 py-1">
                {streak > 0 && <Icon name="flame" size={14} color={vars['--accent']} />}
                <Text className="font-body-bold text-xs text-accent">
                  {streak > 0 ? `${streak}-payday streak` : 'Start your streak'}
                </Text>
              </View>
            </View>
            <Text className="font-mono text-2xl text-ink">{formatPeso(savedThisQuarter)}</Text>
          </View>
        )}

        {payday && (
          <View className="flex-row items-center gap-3 rounded-lg rounded-tl-sm bg-accent-soft px-5 py-4">
            <Pressable
              accessibilityLabel="Previous payday"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setPaydayOffset((offset) => offset - 1)}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface active:opacity-70"
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
            <Button size="sm" onPress={() => router.push('/(app)/checklist')}>
              Review
            </Button>
          </View>
        )}

        <View>
          <SectionLabel>Category balances</SectionLabel>
          {(categories ?? []).length === 0 && (
            <EmptyState>No categories yet — add one from the Categories tab.</EmptyState>
          )}
          {(categories ?? []).length > 0 && (
            <Card>
              {(categories ?? []).map((c, i) => {
                const balance = balances?.[c.id] ?? 0;
                const goal = c.rule?.type === 'goal' ? c.rule.target_amount : null;
                const target = goal ?? (c.rule?.type === 'capped_percent' ? c.rule.cap ?? null : null);
                return (
                  <ListRow
                    key={c.id}
                    isLast={i === (categories?.length ?? 0) - 1}
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
      </ScrollView>
    </SafeAreaView>
  );
}
