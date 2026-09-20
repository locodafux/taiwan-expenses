import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ChecklistGroup, ChecklistRow } from '@/components/ui/Checklist';
import { ErrorState } from '@/components/ui/ErrorState';
import { PaydayCelebration } from '@/components/ui/PaydayCelebration';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  combineQueryState,
  useCategories,
  useCheckLedgerEntry,
  useHouseholdBillItems,
  useHouseholdMembership,
  useIncomes,
  useLedgerEntriesForPayday,
  useMaterializePayday,
  usePaydayCompletionHistory,
  useUpdateLedgerAmount,
} from '@/lib/queries';
import { formatPeso } from '@/lib/format';
import {
  completedPaydayStreak,
  fromDateOnly,
  leftoverByPaydayInMonth,
  nextPayday,
  toDateOnly,
} from '@/lib/payday';

export default function PaydayChecklist() {
  const router = useRouter();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdId = member?.household_id;
  const incomesQuery = useIncomes(householdId);
  const incomes = incomesQuery.data;
  const billsQuery = useHouseholdBillItems(householdId);
  const bills = billsQuery.data;
  const categoriesQuery = useCategories(householdId);

  const paydayDate = useMemo(() => {
    const activeDays = (incomes ?? []).filter((i) => i.active).map((i) => i.recurring_day);
    if (activeDays.length === 0) return undefined;
    return toDateOnly(nextPayday(activeDays));
  }, [incomes]);

  const materialize = useMaterializePayday(householdId);
  const entriesQuery = useLedgerEntriesForPayday(householdId, paydayDate);
  const entries = entriesQuery.data;
  const isLoading = entriesQuery.isLoading || incomesQuery.isLoading || membershipQuery.isLoading;
  const checkEntry = useCheckLedgerEntry(householdId, paydayDate);
  const updateAmount = useUpdateLedgerAmount(householdId, paydayDate);
  const completionHistoryQuery = usePaydayCompletionHistory(householdId);

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    incomesQuery,
    billsQuery,
    categoriesQuery,
    entriesQuery,
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Ledger rows only exist once materialize_payday has run, and this tab stays
  // mounted — so re-run it whenever the categories/bill items it reads change
  // (added here, on another screen, or by a partner via Realtime), not just when
  // the target payday changes. Waits for both lists so mount materializes once.
  const planInputs =
    categoriesQuery.data && bills ? JSON.stringify([categoriesQuery.data, bills]) : undefined;

  useEffect(() => {
    if (householdId && paydayDate && planInputs) materialize.mutate(paydayDate);
    // Only re-materialize when the payday or its inputs change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, paydayDate, planInputs]);

  const cutAdvice = useMemo(() => {
    if (!incomes || !bills) return null;
    const rows = leftoverByPaydayInMonth(incomes, bills, new Date());
    if (rows.length < 2) return null;
    const worst = rows.reduce((a, b) => (b.leftover < a.leftover ? b : a));
    return `If cash gets tight this month, trim the ${worst.day}th payday first — it carries the least cushion.`;
  }, [incomes, bills]);

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color="#c1552f" />
      </SafeAreaView>
    );
  }

  if (!paydayDate) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-page px-10">
        <Text className="text-center font-body text-sm text-ink-muted">
          Add an income first to see your payday checklist.
        </Text>
        <Button variant="secondary" size="sm" onPress={() => router.push('/(app)/income')}>
          Go to Income
        </Button>
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

  const outgoing = (entries ?? []).filter((e) => e.categories?.kind !== 'fund');
  const staying = (entries ?? []).filter((e) => e.categories?.kind === 'fund');

  const allChecked = total > 0 && checked === total;
  const streak = allChecked
    ? completedPaydayStreak(completionHistoryQuery.data ?? [], paydayDate)
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        <View>
          <Text className="font-display-semibold text-lg text-ink">
            {paydayDay}th payday checklist
          </Text>
          <Text className="mt-1 font-body text-xs text-ink-muted">{formatPeso(takeHome)} take-home</Text>
        </View>

        {total > 0 && (
          <ProgressBar
            label={`${checked} / ${total} items checked`}
            amountLabel={`${formatPeso(checkedAmount)} of ${formatPeso(totalAmount)} accounted for`}
            percent={(checked / total) * 100}
          />
        )}

        {allChecked && <PaydayCelebration streak={streak} />}

        <Card className="px-5 py-4">
          {total === 0 && (
            <Text className="py-4 font-body text-sm text-ink-muted">
              Nothing to check off for this payday yet.
            </Text>
          )}

          {outgoing.length > 0 && (
            <ChecklistGroup heading="Money leaving" note="Bills and debt payments due this payday.">
              {outgoing.map((entry) => (
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
                  onLabelPress={() => router.push(`/(app)/categories/${entry.category_id}`)}
                />
              ))}
            </ChecklistGroup>
          )}

          {staying.length > 0 && (
            <ChecklistGroup heading="Money staying" note="Fund contributions kept in the household.">
              {staying.map((entry) => (
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
                  onLabelPress={() => router.push(`/(app)/categories/${entry.category_id}`)}
                />
              ))}
            </ChecklistGroup>
          )}
        </Card>

        {editingId && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Card className="gap-3 p-4">
              <Text className="font-body text-xs text-ink-muted">Adjust amount for this payday</Text>
              <TextField
                autoFocus
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
              />
              {editError && <Text className="font-body text-sm text-status-bad">{editError}</Text>}
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
          </Animated.View>
        )}

        {cutAdvice && <Callout>{cutAdvice}</Callout>}
      </KeyboardScroll>
    </SafeAreaView>
  );
}
