import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/Heading';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatPeso } from '@/lib/format';
import { useMonthlyCells } from '@/lib/monthlyCells';
import { addMonths, fromDateOnly, scheduledMonthTotal } from '@/lib/payday';
import { useHouseholdMembership, useIncomes } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

// Mirrors taiwan-fund-planner.html's "Full numbers" table (now the Dashboard's Yearly Cashflow): October 2026 through
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

// The Dashboard's "Yearly Cashflow" section: a bar graph on top, then the table of income, expenses, debt and
// every fund, month by month.
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
  // Graph series, same order as the table's columns after Income.
  const series = [
    { label: 'Expenses', color: vars['--cat-expenses'] },
    { label: 'Debt', color: vars['--cat-debt'] },
    ...funds.map((c) => ({ label: c.name, color: c.color ?? vars['--ink-muted'] })),
  ];
  const outflow = (cells: number[]) => cells.slice(1).reduce((a, b) => a + b, 0);
  // Only for scaling bar lengths against each other; never shown.
  const maxBar = Math.max(1, ...rows.map((r) => Math.max(r.cells[0], outflow(r.cells))));
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
        <ScreenHeader title="Yearly Cashflow" />
        <Text className="font-body text-sm text-ink-muted">
          Every month, {monthLabel(MONTHS[0])} – {monthLabel(MONTHS[MONTHS.length - 1])}
        </Text>
      </View>

      {/* Same bar style as the Breakdown month chart: income on a thin bar, where it goes on the stacked one. */}
      <View testID="cashflow-graph" className="gap-2">
        {rows.map((r) => (
          <View key={r.month} className="flex-row items-center gap-3 px-2">
            <Text className="w-14 font-body-semibold text-xs text-ink">{monthLabel(r.month)}</Text>
            <View className="flex-1 gap-1">
              <View style={{ width: `${(r.cells[0] / maxBar) * 100}%`, backgroundColor: vars['--accent'] }} className="h-2 rounded-sm" />
              <View style={{ width: `${(outflow(r.cells) / maxBar) * 100}%` }} className="h-4 flex-row overflow-hidden rounded-sm">
                {series.map((s, i) =>
                  r.cells[i + 1] > 0 ? <View key={i} style={{ flex: r.cells[i + 1], backgroundColor: s.color }} /> : null,
                )}
              </View>
            </View>
          </View>
        ))}
        <View className="flex-row flex-wrap gap-x-4 gap-y-1 px-2">
          {[{ label: 'Income', color: vars['--accent'] }, ...series].map((s, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <View style={{ backgroundColor: s.color }} className="h-3 w-3 rounded-sm" />
              <Text className="font-body text-xs text-ink-2">{s.label}</Text>
            </View>
          ))}
        </View>
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
        Months before today are your real checked history; the rest is projected from your current rules. The top bar
        is income and the colored bar is where it goes. Debt is
        bills that have a last payment date; Expenses is the rest.
      </Text>
    </View>
  );
}
