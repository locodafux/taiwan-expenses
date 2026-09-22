import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import { Card, ListRow } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatPeso } from '@/lib/format';
import {
  combineQueryState,
  useCreateIncome,
  useHouseholdMembership,
  useIncomes,
  useUpdateIncome,
} from '@/lib/queries';
import type { Income } from '@/lib/database.types';
import { useTheme } from '@/theme/ThemeProvider';

const RECURRING_DAYS = [5, 15, 20, 30];

function ordinal(day: number) {
  return `${day}th`;
}

export default function IncomeManagement() {
  const { vars } = useTheme();
  const router = useRouter();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdId = member?.household_id;
  const incomesQuery = useIncomes(householdId);
  const incomes = incomesQuery.data;
  const createIncome = useCreateIncome(householdId);
  const updateIncome = useUpdateIncome(householdId);

  const { isError, refetch } = combineQueryState(membershipQuery, incomesQuery);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState<number>(RECURRING_DAYS[0]);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Income | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDay, setEditDay] = useState<number>(RECURRING_DAYS[0]);

  const combined = (incomes ?? []).filter((i) => i.active).reduce((s, i) => s + i.amount, 0);

  async function handleAdd() {
    if (!member || !label || !amount) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError('Enter a valid amount');
    setError(null);
    try {
      await createIncome.mutateAsync({
        member_id: member.id,
        label,
        amount: parsedAmount,
        recurring_day: day,
      });
      setLabel('');
      setAmount('');
      setDay(RECURRING_DAYS[0]);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save income');
    }
  }

  function startEdit(income: Income) {
    setAdding(false);
    setEditing(income);
    setEditLabel(income.label);
    setEditAmount(String(income.amount));
    setEditDay(income.recurring_day);
  }

  async function handleSaveEdit() {
    if (!editing || !editLabel || !editAmount) return;
    await updateIncome.mutateAsync({
      id: editing.id,
      label: editLabel,
      amount: Number(editAmount),
      recurring_day: editDay,
    });
    setEditing(null);
  }

  async function handleToggleActive() {
    if (!editing) return;
    await updateIncome.mutateAsync({ id: editing.id, active: !editing.active });
    setEditing(null);
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        {/* Not a tab any more - reached from Settings -> Your profile. */}
        <Pressable
          onPress={() => router.navigate('/(app)/settings')}
          hitSlop={13}
          accessibilityRole="button"
          className="self-start py-3"
        >
          <Text className="font-body text-sm text-ink-2">‹ Settings</Text>
        </Pressable>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-display-semibold text-lg text-ink">Incomes</Text>
          <Button
            size="sm"
            onPress={() => {
              setEditing(null);
              setAdding((v) => !v);
            }}
          >
            Add
          </Button>
        </View>

        {adding && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Card className="gap-3 p-4">
              <Text className="font-body text-xs text-ink-muted">Label</Text>
              <TextField
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. 5th payday"
                className="rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Amount</Text>
              <TextField
                value={amount}
                onChangeText={setAmount}
                placeholder="₱0"
                keyboardType="numeric"
                className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Recurring day</Text>
              <View className="flex-row gap-2">
                {RECURRING_DAYS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setDay(p)}
                    className={`rounded-md border px-3 py-3 ${
                      day === p ? 'border-accent bg-accent-soft' : 'border-border'
                    }`}
                  >
                    <Text className="font-body text-sm text-ink">{p}th</Text>
                  </Pressable>
                ))}
              </View>
              {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}
              <View className="flex-row gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onPress={() => {
                    setAdding(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" className="flex-1" loading={createIncome.isPending} onPress={handleAdd}>
                  Save
                </Button>
              </View>
            </Card>
          </Animated.View>
        )}

        {editing && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Card className="gap-3 p-4">
              <Text className="font-body text-xs text-ink-muted">Label</Text>
              <TextField
                value={editLabel}
                onChangeText={setEditLabel}
                placeholder="e.g. 5th payday"
                className="rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Amount</Text>
              <TextField
                value={editAmount}
                onChangeText={setEditAmount}
                placeholder="₱0"
                keyboardType="numeric"
                className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Recurring day</Text>
              <View className="flex-row flex-wrap gap-2">
                {(RECURRING_DAYS.includes(editDay) ? RECURRING_DAYS : [...RECURRING_DAYS, editDay].sort((a, b) => a - b)).map(
                  (p) => (
                    <Pressable
                      key={p}
                      onPress={() => setEditDay(p)}
                      className={`rounded-md border px-3 py-3 ${
                        editDay === p ? 'border-accent bg-accent-soft' : 'border-border'
                      }`}
                    >
                      <Text className="font-body text-sm text-ink">{p}th</Text>
                    </Pressable>
                  ),
                )}
              </View>
              <View className="flex-row gap-3">
                <Button variant="secondary" className="flex-1" onPress={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button variant="primary" className="flex-1" loading={updateIncome.isPending} onPress={handleSaveEdit}>
                  Save
                </Button>
              </View>
              <Button variant="ghost" loading={updateIncome.isPending} onPress={handleToggleActive}>
                {editing.active ? 'Deactivate this income' : 'Reactivate this income'}
              </Button>
            </Card>
          </Animated.View>
        )}

        <Card>
          {(incomes ?? []).map((income, i) => (
            <ListRow
              key={income.id}
              isLast={i === (incomes?.length ?? 0) - 1}
              onPress={() => startEdit(income)}
            >
              <Avatar
                initial={income.household_members?.display_name?.[0]?.toUpperCase() ?? '?'}
                color={income.household_members?.color ?? '#999'}
                size={26}
              />
              <View className="flex-1">
                <Text className="font-body-semibold text-base text-ink">{income.label}</Text>
                <Text className="mt-[2px] font-body text-xs text-ink-muted">
                  {income.household_members?.display_name} · recurring on the {ordinal(income.recurring_day)}
                  {income.active ? '' : ' · inactive'}
                </Text>
              </View>
              <Text className="font-mono text-base text-ink">{formatPeso(income.amount)}</Text>
              <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />
            </ListRow>
          ))}
          {(incomes ?? []).length === 0 && (
            <Text className="p-4 font-body text-sm text-ink-muted">No incomes yet.</Text>
          )}
        </Card>

        <View className="flex-row items-center justify-between rounded-md bg-surface-2 p-4">
          <Text className="font-body text-sm text-ink-2">Combined monthly income</Text>
          <Text className="font-mono text-md text-ink">{formatPeso(combined)}</Text>
        </View>
      </KeyboardScroll>
    </SafeAreaView>
  );
}
