import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

function Ring({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={42} height={42} viewBox="0 0 42 42">
      <Circle cx={21} cy={21} r={r} fill="none" stroke={trackColor} strokeWidth={4} />
      <Circle
        cx={21}
        cy={21}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))}
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

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-7 py-6" className="flex-1">
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
          <Card className="gap-1 p-5">
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

        {savedThisQuarter !== undefined && streak !== undefined && (
          <View className="flex-row items-center gap-4 rounded-xl border border-border bg-surface p-5">
            <Ring
              pct={setupSteps.filter((s) => s.done).length / setupSteps.length}
              color={vars['--accent']}
              trackColor={vars['--surface-3']}
            />
            <View className="flex-1">
              <Text className="font-body text-xs uppercase tracking-wide text-ink-muted">
                Saved this quarter
              </Text>
              <Text className="mt-1 font-mono text-xl text-ink">{formatPeso(savedThisQuarter)}</Text>
            </View>
            <View className="rounded-full bg-page px-3 py-1.5">
              <Text className="font-body-bold text-xs text-ink">
                {streak > 0 ? `🔥 ${streak}-payday streak` : 'Start your streak'}
              </Text>
            </View>
          </View>
        )}

        {payday && (
          <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface p-5">
            <View>
              <Text className="font-body text-xs uppercase tracking-wide text-ink-muted">
                Next payday
              </Text>
              <Text className="mt-1 font-mono text-xl text-ink">{formatPeso(payday.amount)}</Text>
              <Text className="mt-1 font-body text-xs text-ink-2">
                {payday.date.getDate()}th · in {payday.daysAway} day{payday.daysAway === 1 ? '' : 's'}
              </Text>
            </View>
            <Button size="sm" onPress={() => router.push('/(app)/checklist')}>
              Review
            </Button>
          </View>
        )}

        <View>
          <Text className="mb-3 font-body-bold text-sm text-ink">Category balances</Text>
          <View className="gap-3">
            {(categories ?? []).map((c) => {
              const balance = balances?.[c.id] ?? 0;
              const goal = c.rule?.type === 'goal' ? c.rule.target_amount : null;
              const target = goal ?? (c.rule?.type === 'capped_percent' ? c.rule.cap ?? null : null);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`/(app)/categories/${c.id}`)}
                  className="flex-row items-center gap-4 rounded-md border border-border bg-surface p-4"
                >
                  {target != null ? (
                    <Ring pct={balance / target} color={c.color ?? '#999'} trackColor={vars['--surface-3']} />
                  ) : (
                    <View className="h-[42px] w-[42px] items-center justify-center">
                      <View className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color ?? '#999' }} />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="font-body-semibold text-base text-ink">{c.name}</Text>
                    <Text className="font-body text-xs text-ink-muted">
                      {c.kind === 'bill' ? 'Recurring bills' : goal ? `Goal · ${formatPeso(goal)}` : 'No cap'}
                    </Text>
                  </View>
                  {c.kind === 'fund' ? (
                    <Text className="font-mono text-sm text-ink">
                      {formatPeso(balance)}
                      {goal ? ` / ${formatPeso(goal)}` : ''}
                    </Text>
                  ) : (
                    <Text className="font-mono text-sm text-ink">
                      {formatPeso(balancesThisMonth?.[c.id] ?? 0)} this month
                    </Text>
                  )}
                  <Text className="text-ink-muted">›</Text>
                </Pressable>
              );
            })}
            {(categories ?? []).length === 0 && (
              <Text className="font-body text-sm text-ink-muted">
                No categories yet — add one from the Categories tab.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
