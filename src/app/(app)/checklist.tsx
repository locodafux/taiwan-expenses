import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ChecklistGroup, ChecklistRow } from '@/components/ui/Checklist';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  useCheckLedgerEntry,
  useHouseholdBillItems,
  useHouseholdMembership,
  useIncomes,
  useLedgerEntriesForPayday,
  useMaterializePayday,
  useUpdateLedgerAmount,
} from '@/lib/queries';
import { fromDateOnly, leftoverByPaydayInMonth, nextPayday, toDateOnly } from '@/lib/payday';

function formatPeso(n: number) {
  return '₱' + Math.round(n).toLocaleString();
}

export default function PaydayChecklist() {
  const { data: member } = useHouseholdMembership();
  const householdId = member?.household_id;
  const { data: incomes } = useIncomes(householdId);
  const { data: bills } = useHouseholdBillItems(householdId);

  const paydayDate = useMemo(() => {
    const activeDays = (incomes ?? []).filter((i) => i.active).map((i) => i.recurring_day);
    if (activeDays.length === 0) return undefined;
    return toDateOnly(nextPayday(activeDays));
  }, [incomes]);

  const materialize = useMaterializePayday(householdId);
  const { data: entries, isLoading } = useLedgerEntriesForPayday(householdId, paydayDate);
  const checkEntry = useCheckLedgerEntry(householdId, paydayDate);
  const updateAmount = useUpdateLedgerAmount(householdId, paydayDate);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (householdId && paydayDate) materialize.mutate(paydayDate);
    // Only re-materialize when the target payday changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, paydayDate]);

  const cutAdvice = useMemo(() => {
    if (!incomes || !bills) return null;
    const rows = leftoverByPaydayInMonth(incomes, bills, new Date());
    if (rows.length < 2) return null;
    const worst = rows.reduce((a, b) => (b.leftover < a.leftover ? b : a));
    return `If cash gets tight this month, trim the ${worst.day}th payday first — it carries the least cushion.`;
  }, [incomes, bills]);

  if (isLoading || !paydayDate) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color="#c1552f" />
      </SafeAreaView>
    );
  }

  const paydayDay = fromDateOnly(paydayDate).getDate();
  const total = entries?.length ?? 0;
  const checked = entries?.filter((e) => e.status === 'checked').length ?? 0;
  const totalAmount = (entries ?? []).reduce((s, e) => s + e.amount, 0);
  const checkedAmount = (entries ?? [])
    .filter((e) => e.status === 'checked')
    .reduce((s, e) => s + e.amount, 0);
  const takeHome = (incomes ?? [])
    .filter((i) => i.active && i.recurring_day === paydayDay)
    .reduce((s, i) => s + i.amount, 0);

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-7 py-6" className="flex-1">
        <Text className="font-display-semibold text-lg text-ink">
          {paydayDay}th payday checklist
        </Text>

        {total > 0 && (
          <ProgressBar
            label={`${checked} / ${total} items checked`}
            amountLabel={`${formatPeso(checkedAmount)} of ${formatPeso(totalAmount)} accounted for`}
            percent={(checked / total) * 100}
          />
        )}

        <View className="rounded-lg border border-border bg-surface px-6 py-5">
          <ChecklistGroup
            heading={`${paydayDay}th payday · ${formatPeso(takeHome)} take-home`}
          >
            {(entries ?? []).map((entry) => (
              <ChecklistRow
                key={entry.id}
                label={entry.bill_items?.label ?? entry.categories?.name ?? 'Item'}
                amount={formatPeso(entry.amount)}
                color={entry.categories?.color ?? '#999'}
                checked={entry.status === 'checked'}
                onToggle={() => checkEntry.mutate({ id: entry.id, checked: entry.status !== 'checked' })}
                onAmountPress={() => {
                  setEditingId(entry.id);
                  setEditAmount(String(entry.amount));
                  setEditError(null);
                }}
              />
            ))}
            {total === 0 && (
              <Text className="py-4 font-body text-sm text-ink-muted">
                Nothing to check off for this payday yet.
              </Text>
            )}
          </ChecklistGroup>
        </View>

        {editingId && (
          <Card className="gap-3 p-5">
            <Text className="font-body text-xs text-ink-muted">Adjust amount for this payday</Text>
            <TextInput
              autoFocus
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
            />
            {editError && <Text className="font-body text-sm text-accent">{editError}</Text>}
            <View className="flex-row gap-3">
              <Button variant="secondary" className="flex-1" onPress={() => setEditingId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                loading={updateAmount.isPending}
                onPress={async () => {
                  const parsed = Number(editAmount);
                  if (!Number.isFinite(parsed) || parsed <= 0) return setEditError('Enter a valid amount');
                  try {
                    await updateAmount.mutateAsync({ id: editingId, amount: parsed });
                    setEditingId(null);
                  } catch (e) {
                    setEditError(e instanceof Error ? e.message : 'Could not update amount');
                  }
                }}
              >
                Save
              </Button>
            </View>
          </Card>
        )}

        {cutAdvice && <Callout>{cutAdvice}</Callout>}
      </ScrollView>
    </SafeAreaView>
  );
}
