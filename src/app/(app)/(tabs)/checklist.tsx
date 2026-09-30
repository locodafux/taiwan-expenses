import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { Card, CategoryMark, ListRow } from '@/components/ui/Card';
import { ChecklistGroup, ChecklistRow } from '@/components/ui/Checklist';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScreenHeader } from '@/components/ui/Heading';
import { PaydayCelebration } from '@/components/ui/PaydayCelebration';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  combineQueryState,
  useCategories,
  useCategoryMonthPercents,
  useCheckLedgerEntry,
  useGoalShortfalls,
  useHouseholdBillItems,
  useHouseholdMembership,
  useIncomes,
  useLedgerEntriesForPayday,
  useMaterializePayday,
  usePaydayCarries,
  usePaydayCompletionHistory,
  usePaydayPreview,
  useUpdateLedgerAmount,
} from '@/lib/queries';
import { formatFolioDate, formatPeso } from '@/lib/format';
import {
  APP_START_DATE,
  appToday,
  categoryActiveInMonth,
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
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdId = member?.household_id;
  const incomesQuery = useIncomes(householdId);
  const incomes = incomesQuery.data;
  const billsQuery = useHouseholdBillItems(householdId);
  const bills = billsQuery.data;
  const categoriesQuery = useCategories(householdId);
  const monthPercentsQuery = useCategoryMonthPercents(householdId);

  // The true next payday - the only one materialize_payday ever writes real
  // rows for. A date param further out (dashboard stepper's Review button)
  // asks to look ahead; a date param before it asks to look back at history.
  const nextPaydayDate = useMemo(() => {
    const activeDays = (incomes ?? []).filter((i) => i.active).map((i) => i.recurring_day);
    if (activeDays.length === 0) return undefined;
    return toDateOnly(nextPayday(activeDays));
  }, [incomes]);
  // A date param before October 2026 (a stale link) falls back to the next payday.
  const paydayDate = dateParam && dateParam >= APP_START_DATE ? dateParam : nextPaydayDate;
  const isCurrent = !!paydayDate && paydayDate === nextPaydayDate;
  const isFuture = !!paydayDate && !!nextPaydayDate && paydayDate > nextPaydayDate;

  const materialize = useMaterializePayday(householdId);
  const entriesQuery = useLedgerEntriesForPayday(householdId, isFuture ? undefined : paydayDate);
  // A future payday has no ledger_entries yet - preview_payday computes what
  // materialize_payday would write without writing it, so nothing here can be
  // ticked off before that payday is real.
  const previewQuery = usePaydayPreview(householdId, isFuture ? paydayDate : undefined);
  const previewEntries = useMemo(() => {
    if (!isFuture || !previewQuery.data || !categoriesQuery.data) return undefined;
    const catById = new Map(categoriesQuery.data.map((c) => [c.id, c]));
    const billById = new Map((bills ?? []).map((b) => [b.id, b]));
    return previewQuery.data.map((row) => {
      const cat = catById.get(row.category_id);
      const bill = row.bill_item_id ? billById.get(row.bill_item_id) : undefined;
      return {
        id: `${row.category_id}:${row.bill_item_id ?? 'fund'}`,
        category_id: row.category_id,
        bill_item_id: row.bill_item_id,
        amount: row.amount,
        status: 'pending' as const,
        manual: false,
        categories: cat ? { name: cat.name, color: cat.color, kind: cat.kind } : null,
        bill_items: bill ? { label: bill.label } : null,
      };
    });
  }, [isFuture, previewQuery.data, categoriesQuery.data, bills]);
  const entries = isFuture ? previewEntries : entriesQuery.data;
  const isLoading =
    incomesQuery.isLoading ||
    membershipQuery.isLoading ||
    (isFuture ? previewQuery.isLoading : entriesQuery.isLoading);
  const checkEntry = useCheckLedgerEntry(householdId, paydayDate);
  const updateAmount = useUpdateLedgerAmount(householdId, paydayDate);
  const completionHistoryQuery = usePaydayCompletionHistory(householdId);
  const shortfalls = useGoalShortfalls(householdId, paydayDate).data;
  const carries = usePaydayCarries(householdId, paydayDate).data;

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    incomesQuery,
    billsQuery,
    categoriesQuery,
    isFuture ? previewQuery : entriesQuery,
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Ledger rows only exist once materialize_payday has run, and this tab stays
  // mounted — so re-run it whenever the categories/bill items it reads change
  // (added here, on another screen, or by a partner via Realtime), not just when
  // the target payday changes. Waits for both lists so mount materializes once.
  // (A failed month-percent load falls back to none rather than never materializing.)
  const monthPercents = monthPercentsQuery.data ?? (monthPercentsQuery.isError ? [] : undefined);
  const planInputs =
    categoriesQuery.data && bills && monthPercents
      ? JSON.stringify([categoriesQuery.data, bills, monthPercents])
      : undefined;

  useEffect(() => {
    // Only the current payday ever gets real rows - a future one is preview-only,
    // and a past one keeps whatever it was materialized with at the time.
    if (householdId && isCurrent && paydayDate && planInputs) materialize.mutate(paydayDate);
    // Only re-materialize when the payday or its inputs change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, isCurrent, paydayDate, planInputs]);

  const cutAdvice = useMemo(() => {
    if (!incomes || !bills) return null;
    const month = toDateOnly(appToday()).slice(0, 7);
    // Bills of a category outside its start/end months aren't due.
    const rows = leftoverByPaydayInMonth(
      incomes,
      bills.filter((b) => categoryActiveInMonth(b.categories, month)),
      appToday(),
    );
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
      <SafeAreaView className="flex-1 bg-page" edges={[]}>
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page" edges={[]}>
        <ActivityIndicator color={vars['--accent']} />
      </SafeAreaView>
    );
  }

  if (!paydayDate) {
    return (
      <SafeAreaView className="flex-1 justify-center gap-4 bg-page px-10" edges={[]}>
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
  // Checked rows sink to the bottom of their group so what's left stays on top.
  const visible = [...(entries ?? [])].sort(
    (a, b) => Number(a.status === 'checked') - Number(b.status === 'checked'),
  );
  // A ₱0 fund is nothing to tick off (bills can never be 0), so it is out of
  // the count, the progress bar and both totals - the same rows
  // usePaydayCompletionHistory leaves out of the streak.
  const countable = visible.filter((e) => e.amount !== 0);
  const total = countable.length;
  const checked = countable.filter((e) => e.status === 'checked').length;
  const totalAmount = countable.reduce((s, e) => s + e.amount, 0);
  const checkedAmount = countable
    .filter((e) => e.status === 'checked')
    .reduce((s, e) => s + e.amount, 0);
  const takeHome = (incomes ?? [])
    .filter((i) => i.active && i.recurring_day === paydayDay)
    .reduce((s, i) => s + i.amount, 0);

  // A payday whose bills are more than its pay is covered by an earlier one
  // (materialize_payday leaves that money out of the earlier payday's funds),
  // so both paydays say what is held and what for. Plain notes, not rows:
  // there is nothing to tick off.
  const carryNotes = (carries ?? []).flatMap((c) => {
    if (c.from_payday === paydayDate) {
      const day = fromDateOnly(c.to_payday).getDate();
      return [`Keep ${formatPeso(c.amount)} of this pay aside for the ${day}th — that payday's pay doesn't cover its bills.`];
    }
    if (c.to_payday !== paydayDate) return [];
    if (!c.from_payday) return [`${formatPeso(c.amount)} of these bills isn't covered by this month's pay.`];
    const day = fromDateOnly(c.from_payday).getDate();
    return [`${formatPeso(c.amount)} of these bills is paid from what you kept aside on the ${day}th.`];
  });

  const outgoing = visible.filter((e) => e.categories?.kind !== 'fund');
  const staying = visible.filter((e) => e.categories?.kind === 'fund');

  const allChecked = total > 0 && checked === total;
  const streak = allChecked
    ? completedPaydayStreak(completionHistoryQuery.data ?? [], paydayDate)
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={[]}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        <ScreenHeader
          kicker={formatFolioDate(fromDateOnly(paydayDate))}
          title={isFuture ? `${paydayDay}th payday preview` : `${paydayDay}th payday checklist`}
          subtitle={`${formatPeso(takeHome)} take-home`}
        />

        {isFuture && (
          <Callout>
            This is a preview of what this payday will look like — the amounts can still change, and there&apos;s
            nothing to check off until it&apos;s actually paid.
          </Callout>
        )}

        {!isFuture && total > 0 && (
          <ProgressBar
            label={`${checked} / ${total} items checked`}
            amountLabel={`${formatPeso(checkedAmount)} of ${formatPeso(totalAmount)} accounted for`}
            percent={(checked / total) * 100}
          />
        )}

        {!isFuture && allChecked && <PaydayCelebration streak={streak} />}

        {visible.length === 0 && <EmptyState>Nothing to check off for this payday yet.</EmptyState>}

        {visible.length > 0 && (
          <Card className="px-5 py-4">

            {outgoing.length > 0 && (
              <ChecklistGroup heading="Money leaving" note="Bills and debt payments due this payday.">
                {outgoing.map((entry) =>
                  isFuture ? (
                    <PreviewRow
                      key={entry.id}
                      label={entry.bill_items?.label ?? entry.categories?.name ?? 'Item'}
                      amount={formatPeso(entry.amount)}
                      color={entry.categories?.color}
                    />
                  ) : (
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
                  ),
                )}
              </ChecklistGroup>
            )}

            {staying.length > 0 && (
              <ChecklistGroup heading="Money staying" note="Fund contributions kept in the household.">
                {staying.map((entry) =>
                  isFuture ? (
                    <PreviewRow
                      key={entry.id}
                      label={`${entry.categories?.name ?? 'Item'}${entry.manual ? ' · extra' : ''}`}
                      amount={formatPeso(entry.amount)}
                      color={entry.categories?.color}
                    />
                  ) : (
                    <ChecklistRow
                      key={entry.id}
                      label={`${entry.categories?.name ?? 'Item'}${entry.manual ? ' · extra' : ''}`}
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
                  ),
                )}
              </ChecklistGroup>
            )}

            {carryNotes.map((note) => (
              <View key={note} className="flex-row items-start gap-3 pb-1">
                <Icon name="peso" size={16} color={vars['--ink-muted']} />
                <Text className="flex-1 font-body text-sm italic leading-[1.5] text-ink-2">{note}</Text>
              </View>
            ))}
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

// A preview row for a future payday: same label/amount/colour as a
// ChecklistRow, but no checkbox and nothing pressable - there's nothing to
// toggle or edit until that payday is materialized for real.
function PreviewRow({ label, amount, color }: { label: string; amount: string; color: string | null | undefined }) {
  return (
    <ListRow>
      <CategoryMark color={color} size={8} />
      <Text className="flex-1 font-body text-base text-ink">{label}</Text>
      <Text className="font-mono text-sm text-ink-muted">{amount}</Text>
    </ListRow>
  );
}
