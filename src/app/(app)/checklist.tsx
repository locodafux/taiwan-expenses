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
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScreenHeader } from '@/components/ui/Heading';
import { PaydayCelebration } from '@/components/ui/PaydayCelebration';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  combineQueryState,
  useCategories,
  useCheckLedgerEntry,
  useGoalShortfalls,
  useHouseholdBillItems,
  useHouseholdMembership,
  useIncomes,
  useLedgerEntriesForPayday,
  useMaterializePayday,
  usePaydayCompletionHistory,
  useToggleMonthSkip,
  useUpdateLedgerAmount,
} from '@/lib/queries';
import { formatFolioDate, formatPeso } from '@/lib/format';
import {
  completedPaydayStreak,
  fromDateOnly,
  leftoverByPaydayInMonth,
  nextPayday,
  toDateOnly,
} from '@/lib/payday';
import { useTheme } from '@/theme/ThemeProvider';

export default function PaydayChecklist() {
  const { vars } = useTheme();
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
  const toggleSkip = useToggleMonthSkip(householdId, paydayDate);
  const completionHistoryQuery = usePaydayCompletionHistory(householdId);
  const shortfalls = useGoalShortfalls(householdId, paydayDate).data;

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

  // Goals the months before their deadline can't fully fund: say so rather
  // than quietly under-saving.
  const shortfallAdvice = useMemo(() => {
    const names = new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name]));
    const lines = (shortfalls ?? [])
      .filter((s) => names.has(s.category_id))
      .map((s) => `${names.get(s.category_id)} will be ${formatPeso(s.shortfall)} short by its deadline`);
    return lines.length ? `${lines.join('; ')} — there isn't enough room in the months before it.` : null;
  }, [shortfalls, categoriesQuery.data]);

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
        <ActivityIndicator color={vars['--accent']} />
      </SafeAreaView>
    );
  }

  if (!paydayDate) {
    return (
      <SafeAreaView className="flex-1 justify-center gap-4 bg-page px-10">
        <EmptyState>Add an income first to see your payday checklist.</EmptyState>
        <Button variant="secondary" size="sm" onPress={() => router.push('/(app)/income')}>
          Go to Income
        </Button>
      </SafeAreaView>
    );
  }

  const paydayDay = fromDateOnly(paydayDate).getDate();

  // Every row shows, ₱0 included: a fund its rule gave nothing this payday is
  // still listed at ₱0, not hidden (a hidden fund read as a missing category).
  const visible = entries ?? [];
  // A skipped or ₱0 fund is nothing to tick off (bills can never be 0), so it
  // is out of the count, the progress bar and both totals - the same rows
  // usePaydayCompletionHistory leaves out of the streak.
  const countable = visible.filter((e) => e.status !== 'skipped' && e.amount !== 0);
  const total = countable.length;
  const checked = countable.filter((e) => e.status === 'checked').length;
  const totalAmount = countable.reduce((s, e) => s + e.amount, 0);
  const checkedAmount = countable
    .filter((e) => e.status === 'checked')
    .reduce((s, e) => s + e.amount, 0);
  const takeHome = (incomes ?? [])
    .filter((i) => i.active && i.recurring_day === paydayDay)
    .reduce((s, i) => s + i.amount, 0);

  const outgoing = visible.filter((e) => e.categories?.kind !== 'fund');
  const staying = visible.filter((e) => e.categories?.kind === 'fund');

  const allChecked = total > 0 && checked === total;
  const streak = allChecked
    ? completedPaydayStreak(completionHistoryQuery.data ?? [], paydayDate)
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        <ScreenHeader
          kicker={formatFolioDate(fromDateOnly(paydayDate))}
          title={`${paydayDay}th payday checklist`}
          subtitle={`${formatPeso(takeHome)} take-home`}
        />

        {total > 0 && (
          <ProgressBar
            label={`${checked} / ${total} items checked`}
            amountLabel={`${formatPeso(checkedAmount)} of ${formatPeso(totalAmount)} accounted for`}
            percent={(checked / total) * 100}
          />
        )}

        {allChecked && <PaydayCelebration streak={streak} />}

        {visible.length === 0 && <EmptyState>Nothing to check off for this payday yet.</EmptyState>}

        {visible.length > 0 && (
          <Card className="px-5 py-4">

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
              <ChecklistGroup heading="Money staying" note="Fund contributions kept in the household. Skip one to sit a month out.">
                {staying.map((entry) => (
                  <ChecklistRow
                    key={entry.id}
                    label={`${entry.categories?.name ?? 'Item'}${entry.manual ? ' · extra' : ''}`}
                    amount={formatPeso(entry.amount)}
                    color={entry.categories?.color ?? '#999'}
                    checked={entry.status === 'checked'}
                    skipped={entry.status === 'skipped'}
                    // An extra deposit isn't part of the plan, so there's no month to skip.
                    onSkipToggle={
                      entry.manual
                        ? undefined
                        : () =>
                            toggleSkip.mutate({
                              categoryId: entry.category_id,
                              skipped: entry.status !== 'skipped',
                            })
                    }
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
        )}

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

        {shortfallAdvice && <Callout>{shortfallAdvice}</Callout>}
        {cutAdvice && <Callout>{cutAdvice}</Callout>}
      </KeyboardScroll>
    </SafeAreaView>
  );
}
