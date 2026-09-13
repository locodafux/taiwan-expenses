import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { useCreateIncome, useHouseholdMembership, useIncomes } from '@/lib/queries';

function formatPeso(n: number) {
  return '₱' + Math.round(n).toLocaleString();
}

function ordinal(day: number) {
  return `${day}th`;
}

export default function IncomeManagement() {
  const { data: member } = useHouseholdMembership();
  const householdId = member?.household_id;
  const { data: incomes } = useIncomes(householdId);
  const createIncome = useCreateIncome(householdId);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('');

  const combined = (incomes ?? []).filter((i) => i.active).reduce((s, i) => s + i.amount, 0);

  async function handleAdd() {
    if (!member || !label || !amount || !day) return;
    await createIncome.mutateAsync({
      member_id: member.id,
      label,
      amount: Number(amount),
      recurring_day: Number(day),
    });
    setLabel('');
    setAmount('');
    setDay('');
    setAdding(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-7 py-6" className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="font-display-semibold text-lg text-ink">Incomes</Text>
          <Button size="sm" onPress={() => setAdding((v) => !v)}>
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
            <Text className="font-body text-xs text-ink-muted">Recurring day (1-31)</Text>
            <TextInput
              value={day}
              onChangeText={setDay}
              keyboardType="numeric"
              className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
            />
            <View className="flex-row gap-3">
              <Button variant="secondary" className="flex-1" onPress={() => setAdding(false)}>
                Cancel
              </Button>
              <Button variant="primary" className="flex-1" loading={createIncome.isPending} onPress={handleAdd}>
                Save
              </Button>
            </View>
          </Card>
        )}

        <Card>
          {(incomes ?? []).map((income, i) => (
            <ListRow key={income.id} isLast={i === (incomes?.length ?? 0) - 1}>
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
