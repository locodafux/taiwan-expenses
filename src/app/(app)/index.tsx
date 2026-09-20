import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  combineQueryState,
  useCategories,
  useCategoryBalances,
  useCategoryBalancesThisMonth,
  useHouseholdMembers,
  useHouseholdMembership,
  useIncomes,
  usePaydayStreak,
  useSavedThisQuarter,
} from '@/lib/queries';
import { formatPeso } from '@/lib/format';
import { daysUntil, nextPayday } from '@/lib/payday';
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
        strokeLinecap="round"
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
    savedThisQuarterQuery,
    streakQuery,
  );

  const payday = useMemo(() => {
    const activeDays = (incomes ?? []).filter((i) => i.active).map((i) => i.recurring_day);
    if (activeDays.length === 0) return null;
    const date = nextPayday(activeDays);
    const amount = (incomes ?? [])
      .filter((i) => i.active && i.recurring_day === date.getDate())
      .reduce((s, i) => s + i.amount, 0);
    return { date, amount, daysAway: daysUntil(date) };
  }, [incomes]);

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
        <ActivityIndicator color="#c1552f" />
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
          <View>
            <Text className="font-display-semibold text-lg text-ink">Our household</Text>
            <Text className="font-body text-xs text-ink-muted">
              {(members ?? []).map((m) => m.display_name).join(' & ')} · shared budget
            </Text>
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
                <Text className="font-body-bold text-sm text-ink">Get set up</Text>
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
                {!step.done && <Text className="text-ink-muted">›</Text>}
              </Pressable>
            ))}
          </Card>
        )}

        {(showMomentum || payday) && (
          <Card>
            {showMomentum && (
              <ListRow isLast={!payday}>
                <View className="flex-1">
                  <Text className="font-body text-xs uppercase tracking-wide text-ink-muted">
                    Saved this quarter
                  </Text>
                  <Text className="font-mono text-xl text-ink">{formatPeso(savedThisQuarter)}</Text>
                </View>
                <View className="rounded-full bg-page px-3 py-1.5">
                  <Text className="font-body-bold text-xs text-ink">
                    {streak > 0 ? `🔥 ${streak}-payday streak` : 'Start your streak'}
                  </Text>
                </View>
              </ListRow>
            )}

            {payday && (
              <ListRow isLast>
                <View className="flex-1">
                  <Text className="font-body text-xs uppercase tracking-wide text-ink-muted">
                    Next payday
                  </Text>
                  <Text className="font-mono text-xl text-ink">{formatPeso(payday.amount)}</Text>
                  <Text className="font-body text-xs text-ink-2">
                    {payday.date.getDate()}th · in {payday.daysAway} day{payday.daysAway === 1 ? '' : 's'}
                  </Text>
                </View>
                <Button size="sm" onPress={() => router.push('/(app)/checklist')}>
                  Review
                </Button>
              </ListRow>
            )}
          </Card>
        )}

        <View>
          <Text className="mb-2 font-body-bold text-sm text-ink">Category balances</Text>
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
                  <View className="h-[10px] w-[10px] rounded" style={{ backgroundColor: c.color ?? '#999' }} />
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
                      <View
                        className="mt-[5px] h-1 overflow-hidden rounded-full bg-surface-3"
                        accessibilityRole="progressbar"
                        accessibilityValue={{
                          now: Math.round(Math.min(1, Math.max(0, balance / target)) * 100),
                          min: 0,
                          max: 100,
                        }}
                      >
                        <View
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(1, Math.max(0, balance / target)) * 100}%`,
                            backgroundColor: c.color ?? '#999',
                          }}
                        />
                      </View>
                    )}
                  </View>
                  <Text className="font-mono text-sm text-ink">
                    {c.kind === 'fund'
                      ? formatPeso(balance)
                      : `${formatPeso(balancesThisMonth?.[c.id] ?? 0)} this month`}
                  </Text>
                  <Text className="text-ink-muted">›</Text>
                </ListRow>
              );
            })}
            {(categories ?? []).length === 0 && (
              <Text className="p-4 font-body text-sm text-ink-muted">
                No categories yet — add one from the Categories tab.
              </Text>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
