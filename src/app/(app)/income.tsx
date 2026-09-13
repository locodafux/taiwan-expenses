import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { formatPeso } from '@/lib/format';
import { useCreateIncome, useHouseholdMembership, useIncomes, useUpdateIncome } from '@/lib/queries';
import type { Income } from '@/lib/database.types';

const RECURRING_DAYS = [5, 15, 20, 30];

function ordinal(day: number) {
  return `${day}th`;
}

export default function IncomeManagement() {
  const { data: member } = useHouseholdMembership();
  const householdId = member?.household_id;
  const { data: incomes } = useIncomes(householdId);
  const createIncome = useCreateIncome(householdId);
  const updateIncome = useUpdateIncome(householdId);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState<number>(RECURRING_DAYS[0]);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Income | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDay, setEditDay] = useState('');

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
    setEditDay(String(income.recurring_day));
  }

  async function handleSaveEdit() {
    if (!editing || !editLabel || !editAmount || !editDay) return;
    await updateIncome.mutateAsync({
      id: editing.id,
      label: editLabel,
      amount: Number(editAmount),
      recurring_day: Number(editDay),
    });
    setEditing(null);
  }

  async function handleToggleActive() {
    if (!editing) return;
    await updateIncome.mutateAsync({ id: editing.id, active: !editing.active });
    setEditing(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-7 py-6" className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="font-display-semibold text-lg text-ink">Incomes</Text>
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
          <Card className="gap-3 p-5">
            <Text className="font-body text-xs text-ink-muted">Label</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. 5th payday"
              className="rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
            />
            <Text className="font-body text-xs text-ink-muted">Amount</Text>
            <TextInput
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
        )}

        {editing && (
          <Card className="gap-3 p-5">
            <Text className="font-body text-xs text-ink-muted">Label</Text>
            <TextInput
              value={editLabel}
              onChangeText={setEditLabel}
              placeholder="e.g. 5th payday"
              className="rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
            />
            <Text className="font-body text-xs text-ink-muted">Amount</Text>
            <TextInput
              value={editAmount}
              onChangeText={setEditAmount}
              placeholder="₱0"
              keyboardType="numeric"
              className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
            />
            <Text className="font-body text-xs text-ink-muted">Recurring day (1-31)</Text>
            <TextInput
              value={editDay}
              onChangeText={setEditDay}
              keyboardType="numeric"
              className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
            />
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
              <Text className="text-ink-muted">›</Text>
            </ListRow>
          ))}
          {(incomes ?? []).length === 0 && (
            <Text className="p-5 font-body text-sm text-ink-muted">No incomes yet.</Text>
          )}
        </Card>

        <View className="flex-row items-center justify-between rounded-md bg-surface-2 p-4">
          <Text className="font-body text-sm text-ink-2">Combined monthly income</Text>
          <Text className="font-mono text-md text-ink">{formatPeso(combined)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
