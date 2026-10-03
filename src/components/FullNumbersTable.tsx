import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/Heading';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatPeso } from '@/lib/format';
import { useMonthlyCells } from '@/lib/monthlyCells';
import { addMonths, fromDateOnly, scheduledMonthTotal } from '@/lib/payday';
import { useHouseholdMembership, useIncomes } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

// Mirrors taiwan-fund-planner.html's "Full numbers" table: October 2026 through
// July 2027, one row per month. Amounts come from useMonthlyCells (the same
// calculation as the Breakdown chart), so this only lays them out.
const FIRST_MONTH = '2026-10';
const MONTHS = Array.from({ length: 10 }, (_, i) => addMonths(FIRST_MONTH, i));

const MONTH_COL = 'w-20';
const AMOUNT_COL = 'w-28';
const ROW = 'h-11 justify-center';

function monthLabel(month: string) {
  const d = fromDateOnly(`${month}-01`);
  return `${d.toLocaleDateString(undefined, { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

// The Dashboard's "Full numbers" section: income, expenses, debt and every fund, month by month.
export function FullNumbersTable() {
  const { vars } = useTheme();
  const householdId = useHouseholdMembership().data?.household_id;
  const incomesQuery = useIncomes(householdId);
  const { isLoading, isError, refetch, categories, billItemsByCategory, cellValue } = useMonthlyCells(MONTHS);

  const funds = categories.filter((c) => c.kind === 'fund');
  // No debt flag in the schema; a bill item with a last payment date is a loan
  // that retires (docs/plan.md: "debt auto-retires"), the rest are expenses.
  const rows = MONTHS.map((month) => {
    const monthStart = fromDateOnly(`${month}-01`);
    let expenses = 0;
    let debt = 0;
    for (const c of categories) {
      if (c.kind !== 'bill' || month < c.start_month.slice(0, 7)) {
        continue;
      }
      const items = billItemsByCategory[c.id] ?? [];
      debt += scheduledMonthTotal(items.filter((i) => i.end_date), monthStart);
      expenses += scheduledMonthTotal(items.filter((i) => !i.end_date), monthStart);
    }
    return {
      month,
      cells: [
        scheduledMonthTotal(incomesQuery.data ?? [], monthStart),
        expenses,
        debt,
        ...funds.map((c) => cellValue(c, month)),
      ],
    };
  });
  const totals = (rows[0]?.cells ?? []).map((_, col) => rows.reduce((sum, r) => sum + r.cells[col], 0));
  const headers = ['Income', 'Expenses', 'Debt', ...funds.map((c) => c.name)];

  if (isError || incomesQuery.isError) {
    return <ErrorState onRetry={() => { refetch(); incomesQuery.refetch(); }} />;
  }
  if (isLoading || incomesQuery.isLoading) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator color={vars['--accent']} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="gap-1">
        <ScreenHeader title="Full numbers" />
        <Text className="font-body text-sm text-ink-muted">
          Every month, {monthLabel(MONTHS[0])} – {monthLabel(MONTHS[MONTHS.length - 1])}
        </Text>
      </View>

      <View className="flex-row overflow-hidden rounded-lg border border-border bg-surface">
        {/* Month column stays put while the amounts scroll sideways. */}
        <View className={`${MONTH_COL} border-r border-border`}>
          <View className={`${ROW} bg-surface-2 px-3`}>
            <Text className="font-body-semibold text-xs uppercase text-ink-muted">Month</Text>
          </View>
          {rows.map((r) => (
            <View key={r.month} className={`${ROW} border-t border-border px-3`}>
              <Text className="font-body-semibold text-sm text-ink">{monthLabel(r.month)}</Text>
            </View>
          ))}
          <View className={`${ROW} border-t border-border bg-surface-2 px-3`}>
            <Text className="font-body-semibold text-sm text-ink">Total</Text>
          </View>
        </View>
        <ScrollView horizontal className="flex-1">
          <View>
            <View className="flex-row bg-surface-2">
              {headers.map((h, i) => (
                <View key={i} className={`${AMOUNT_COL} ${ROW} px-3`}>
                  <Text numberOfLines={1} className="text-right font-body-semibold text-xs uppercase text-ink-muted">
                    {h}
                  </Text>
                </View>
              ))}
            </View>
            {rows.map((r) => (
              <View key={r.month} className="flex-row border-t border-border">
                {r.cells.map((v, i) => (
                  <View key={i} className={`${AMOUNT_COL} ${ROW} px-3`}>
                    <Text className="text-right font-mono text-sm text-ink">{formatPeso(v)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View className="flex-row border-t border-border bg-surface-2">
              {totals.map((v, i) => (
                <View key={i} className={`${AMOUNT_COL} ${ROW} px-3`}>
                  <Text className="text-right font-mono text-sm font-bold text-ink">{formatPeso(v)}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      <Text className="font-body text-xs leading-[1.5] text-ink-muted">
        Months before today are your real checked history; the rest is projected from your current rules. Debt is
        bills that have a last payment date; Expenses is the rest.
      </Text>
    </View>
  );
}
