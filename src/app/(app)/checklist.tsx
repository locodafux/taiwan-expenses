import { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Callout } from '@/components/ui/Callout';
import { ChecklistGroup, ChecklistRow } from '@/components/ui/Checklist';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  useCheckLedgerEntry,
  useHouseholdBillItems,
  useHouseholdMembership,
  useIncomes,
  useLedgerEntriesForPayday,
  useMaterializePayday,
} from '@/lib/queries';
import { leftoverByPaydayInMonth, nextPayday, toDateOnly } from '@/lib/payday';

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

  const total = entries?.length ?? 0;
  const checked = entries?.filter((e) => e.status === 'checked').length ?? 0;
  const totalAmount = (entries ?? []).reduce((s, e) => s + e.amount, 0);
  const checkedAmount = (entries ?? [])
    .filter((e) => e.status === 'checked')
    .reduce((s, e) => s + e.amount, 0);
  const takeHome = (incomes ?? [])
    .filter((i) => i.active && i.recurring_day === new Date(paydayDate).getDate())
    .reduce((s, i) => s + i.amount, 0);

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-7 py-6" className="flex-1">
        <Text className="font-display-semibold text-lg text-ink">
          {new Date(paydayDate).getDate()}th payday checklist
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
            heading={`${new Date(paydayDate).getDate()}th payday · ${formatPeso(takeHome)} take-home`}
          >
            {(entries ?? []).map((entry) => (
              <ChecklistRow
                key={entry.id}
                label={entry.bill_items?.label ?? entry.categories?.name ?? 'Item'}
                amount={formatPeso(entry.amount)}
                color={entry.categories?.color ?? '#999'}
                checked={entry.status === 'checked'}
                onToggle={() => checkEntry.mutate({ id: entry.id, checked: entry.status !== 'checked' })}
              />
            ))}
            {total === 0 && (
              <Text className="py-4 font-body text-sm text-ink-muted">
                Nothing to check off for this payday yet.
              </Text>
            )}
          </ChecklistGroup>
        </View>

        {cutAdvice && <Callout>{cutAdvice}</Callout>}
      </ScrollView>
    </SafeAreaView>
  );
}
