import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useCategories, useCategoryBalances, useHouseholdMembers, useHouseholdMembership, useIncomes } from '@/lib/queries';
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

function formatPeso(n: number) {
  return '₱' + Math.round(n).toLocaleString();
}

export default function Dashboard() {
  const router = useRouter();
  const { vars } = useTheme();
  const { data: member } = useHouseholdMembership();
  const householdId = member?.household_id;
  const { data: members } = useHouseholdMembers(householdId);
  const { data: categories, isLoading: categoriesLoading } = useCategories(householdId);
  const { data: balances } = useCategoryBalances(householdId);
  const { data: incomes } = useIncomes(householdId);
  const [openId, setOpenId] = useState<string | null>(null);

  const payday = useMemo(() => {
    const activeDays = (incomes ?? []).filter((i) => i.active).map((i) => i.recurring_day);
    if (activeDays.length === 0) return null;
    const date = nextPayday(activeDays);
    const amount = (incomes ?? [])
      .filter((i) => i.active && i.recurring_day === date.getDate())
      .reduce((s, i) => s + i.amount, 0);
    return { date, amount, daysAway: daysUntil(date) };
  }, [incomes]);

  if (categoriesLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color="#c1552f" />
      </SafeAreaView>
    );
  }

  const openCategory = categories?.find((c) => c.id === openId);
  const openBalance = openId ? (balances?.[openId] ?? 0) : 0;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-7 py-6" className="flex-1">
        <View className="flex-row items-center gap-3">
          <View className="flex-row">
            {(members ?? []).slice(0, 2).map((m, i) => (
              <Avatar
                key={m.id}
                initial={m.display_name[0]?.toUpperCase() ?? '?'}
                color={i === 0 ? vars['--accent'] : vars['--cat-taiwan']}
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
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setOpenId(c.id)}
                  className="flex-row items-center gap-4 rounded-md border border-border bg-surface p-4"
                >
                  <Ring pct={goal ? balance / goal : 1} color={c.color ?? '#999'} trackColor={vars['--surface-3']} />
                  <View className="flex-1">
                    <Text className="font-body-semibold text-base text-ink">{c.name}</Text>
                    <Text className="font-body text-xs text-ink-muted">
                      {c.kind === 'bill' ? 'Recurring bills' : goal ? `Goal · ${formatPeso(goal)}` : 'No cap'}
                    </Text>
                  </View>
                  {c.kind === 'fund' && (
                    <Text className="font-mono text-sm text-ink">
                      {formatPeso(balance)}
                      {goal ? ` / ${formatPeso(goal)}` : ''}
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

      {openCategory && (
        <Pressable
          onPress={() => setOpenId(null)}
          className="absolute inset-0 justify-end bg-black/30"
        >
          <View className="gap-4 rounded-t-2xl bg-surface p-6">
            <View className="self-center h-1 w-9 rounded-full bg-baseline" />
            <View className="flex-row items-center gap-3">
              <View className="h-3 w-3 rounded" style={{ backgroundColor: openCategory.color ?? '#999' }} />
              <Text className="font-display-semibold text-lg text-ink">{openCategory.name}</Text>
            </View>
            <Text className="font-mono text-2xl text-ink">{formatPeso(openBalance)}</Text>
            <Button variant="secondary" onPress={() => setOpenId(null)}>
              Close
            </Button>
          </View>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
