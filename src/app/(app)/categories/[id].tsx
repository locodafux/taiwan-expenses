import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card, ListRow } from '@/components/ui/Card';
import { fromDateOnly } from '@/lib/payday';
import {
  useAddManualContribution,
  useBillItems,
  useCategories,
  useCategoryHistory,
  useCreateBillItem,
  useHouseholdMembers,
  useHouseholdMembership,
} from '@/lib/queries';

function formatPeso(n: number) {
  return '₱' + Math.round(n).toLocaleString();
}

export default function CategoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: member } = useHouseholdMembership();
  const householdId = member?.household_id;
  const { data: categories } = useCategories(householdId, { includeArchived: true });
  const category = categories?.find((c) => c.id === id);

  const { data: history } = useCategoryHistory(id);
  const { data: members } = useHouseholdMembers(householdId);
  const { data: billItems } = useBillItems(category?.kind === 'bill' ? id : undefined);

  const addContribution = useAddManualContribution(id, householdId);
  const createBillItem = useCreateBillItem(id);

  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [billLabel, setBillLabel] = useState('');
  const [billDay, setBillDay] = useState('5');
  const [error, setError] = useState<string | null>(null);

  const balance = useMemo(
    () => (history ?? []).reduce((s, h) => s + h.amount, 0),
    [history],
  );

  function memberName(userId: string | null) {
    if (!userId) return 'Manual entry';
    return members?.find((m) => m.user_id === userId)?.display_name ?? 'Manual entry';
  }

  if (!category) return null;

  const goal = category.rule?.type === 'goal' ? category.rule.target_amount : null;
  const pct = goal ? Math.min(1, balance / goal) : null;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-7 py-6" className="flex-1">
        <Pressable onPress={() => router.back()}>
          <Text className="font-body text-sm text-ink-2">‹ Categories</Text>
        </Pressable>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-3 w-3 rounded" style={{ backgroundColor: category.color ?? '#999' }} />
            <Text className="font-display-semibold text-lg text-ink">{category.name}</Text>
          </View>
          <Button size="sm" onPress={() => setAdding((v) => !v)}>
            {category.kind === 'fund' ? '+ Add contribution' : '+ Add item'}
          </Button>
        </View>

        <Card className="p-5">
          <Text className="font-mono text-2xl" style={{ color: category.color ?? undefined }}>
            {formatPeso(balance)}
          </Text>
          <Text className="mt-1 font-body text-xs text-ink-muted">
            {goal
              ? `of ${formatPeso(goal)} goal${category.rule?.type === 'goal' && category.rule.target_date ? ` · complete by ${fromDateOnly(category.rule.target_date).toLocaleDateString(undefined, { month: 'long' })}` : ''}`
              : category.kind === 'bill'
                ? 'paid to date'
                : 'all-time, no cap'}
          </Text>
          {pct !== null && (
            <View className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
              <View
                className="h-full rounded-full"
                style={{ width: `${pct * 100}%`, backgroundColor: category.color ?? '#999' }}
              />
            </View>
          )}
        </Card>

        {adding && category.kind === 'fund' && (
          <Card className="gap-3 p-5">
            <Text className="font-body text-xs text-ink-muted">Amount</Text>
            <TextInput
              autoFocus
              value={amount}
              onChangeText={setAmount}
              placeholder="₱0"
              keyboardType="numeric"
              className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
            />
            {error && <Text className="font-body text-sm text-accent">{error}</Text>}
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
              <Button
                variant="primary"
                className="flex-1"
                disabled={!amount}
                loading={addContribution.isPending}
                onPress={async () => {
                  const parsedAmount = Number(amount);
                  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                    return setError('Enter a valid amount');
                  }
                  setError(null);
                  try {
                    await addContribution.mutateAsync({ amount: parsedAmount });
                    setAmount('');
                    setAdding(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not save contribution');
                  }
                }}
              >
                Save
              </Button>
            </View>
          </Card>
        )}

        {adding && category.kind === 'bill' && (
          <Card className="gap-3 p-5">
            <Text className="font-body text-xs text-ink-muted">Label</Text>
            <TextInput
              value={billLabel}
              onChangeText={setBillLabel}
              placeholder="e.g. Internet"
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
              value={billDay}
              onChangeText={setBillDay}
              keyboardType="numeric"
              className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
            />
            {error && <Text className="font-body text-sm text-accent">{error}</Text>}
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
              <Button
                variant="primary"
                className="flex-1"
                disabled={!billLabel || !amount}
                loading={createBillItem.isPending}
                onPress={async () => {
                  const parsedAmount = Number(amount);
                  const parsedDay = Number(billDay);
                  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                    return setError('Enter a valid amount');
                  }
                  if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
                    return setError('Recurring day must be between 1 and 31');
                  }
                  setError(null);
                  try {
                    await createBillItem.mutateAsync({
                      label: billLabel,
                      amount: parsedAmount,
                      recurring_day: parsedDay,
                    });
                    setBillLabel('');
                    setAmount('');
                    setAdding(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not save item');
                  }
                }}
              >
                Save
              </Button>
            </View>
          </Card>
        )}

        {category.kind === 'bill' && (
          <View>
            <Text className="mb-3 font-body-bold text-sm text-ink">Line items</Text>
            <Card>
              {(billItems ?? []).map((b, i) => (
                <ListRow key={b.id} isLast={i === (billItems?.length ?? 0) - 1}>
                  <View className="flex-1">
                    <Text className="font-body-semibold text-base text-ink">{b.label}</Text>
                    <Text className="mt-[2px] font-body text-xs text-ink-muted">
                      On the {b.recurring_day}th{b.end_date ? ` · retires ${b.end_date}` : ''}
                    </Text>
                  </View>
                  <Text className="font-mono text-sm text-ink">{formatPeso(b.amount)}</Text>
                </ListRow>
              ))}
              {(billItems ?? []).length === 0 && (
                <Text className="p-5 font-body text-sm text-ink-muted">No line items yet.</Text>
              )}
            </Card>
          </View>
        )}

        <View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-body-bold text-sm text-ink">History</Text>
            {category.kind === 'bill' && (
              <Pressable onPress={() => router.push('/(app)/checklist')}>
                <Text className="font-body text-xs text-ink-2">This payday's checklist ›</Text>
              </Pressable>
            )}
          </View>
          <Card>
            {(history ?? []).map((h, i) => (
              <ListRow key={h.id} isLast={i === (history?.length ?? 0) - 1}>
                <Text className="flex-1 font-body text-sm text-ink">
                  {fromDateOnly(h.payday_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                  <Text className="text-ink-muted">· {memberName(h.checked_by)}</Text>
                </Text>
                <Text className="font-mono text-sm text-status-good">+{formatPeso(h.amount)}</Text>
              </ListRow>
            ))}
            {(history ?? []).length === 0 && (
              <Text className="p-5 font-body text-sm text-ink-muted">Nothing checked off yet.</Text>
            )}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
