import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Card, CategoryMark } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Heading';
import { ErrorState } from '@/components/ui/ErrorState';
import { useMonthlyCells } from '@/lib/monthlyCells';
import { addMonths, appToday, fromDateOnly, scheduledMonthTotal, toDateOnly } from '@/lib/payday';
import { useHouseholdMembership, useIncomes } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

// Mirrors taiwan-fund-planner.html's "Full numbers" table (now the Dashboard's Yearly Cashflow): October 2026 through
// September 2029 (the forecast RPC's 36-month cap), one row per month. Amounts come from useMonthlyCells (the same
// calculation as the Breakdown chart), so this only lays them out.
const FIRST_MONTH = '2026-10';
const MONTHS = Array.from({ length: 36 }, (_, i) => addMonths(FIRST_MONTH, i));

const MONTH_COL = 'w-16';
const AMOUNT_COL = 'w-28';
const ROW = 'h-10 justify-center';

// Amounts are in pesos (the subtitle says so once), so the cells drop the repeated ₱ and a zero reads as a dash.
const num = (n: number) => (Math.round(n) === 0 ? '–' : Math.round(n).toLocaleString());

function monthLabel(month: string) {
  const d = fromDateOnly(`${month}-01`);
  return `${d.toLocaleDateString(undefined, { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

// The Dashboard's "Yearly Cashflow" section: the table of income, expenses, debt and every fund, month by month.
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
    const fundCells = funds.map((c) => cellValue(c, month));
    // Money staying = every fund column added up (Excess included: a group parent's cell is
    // only what its children leave, so nothing is counted twice).
    const staying = fundCells.reduce((sum, v) => sum + v, 0);
    return {
      month,
      cells: [scheduledMonthTotal(incomesQuery.data ?? [], monthStart), expenses, debt, staying, ...fundCells],
    };
  });
  const totals = (rows[0]?.cells ?? []).map((_, col) => rows.reduce((sum, r) => sum + r.cells[col], 0));
  // Column headers after Income, each with its color.
  const series = [
    { label: 'Expenses', color: vars['--cat-expenses'] },
    { label: 'Debt', color: vars['--cat-debt'] },
    { label: 'Money staying', color: vars['--accent'] },
    ...funds.map((c) => ({ label: c.name, color: c.color ?? vars['--ink-muted'] })),
  ];
  const headers = ['Income', ...series.map((s) => s.label)];
  const currentMonth = toDateOnly(appToday()).slice(0, 7);

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
    <View className="gap-4">
      <View className="gap-1">
        <ScreenHeader title="Yearly Cashflow" />
        <Text className="font-body text-sm text-ink-muted">
          Every month, {monthLabel(MONTHS[0])} – {monthLabel(MONTHS[MONTHS.length - 1])} · amounts in pesos
        </Text>
      </View>

      <Card className="flex-row overflow-hidden">
        {/* Month column stays put while the amounts scroll sideways. */}
        <View className={`${MONTH_COL} border-r border-gridline`}>
          <View className={`${ROW} bg-surface-2 px-3`}>
            <Text className="font-body-semibold text-xs uppercase text-ink-muted">Month</Text>
          </View>
          {rows.map((r) => (
            <View
              key={r.month}
              className={`${ROW} border-t border-gridline px-3 ${r.month === currentMonth ? 'bg-accent-soft' : ''}`}
            >
              <Text className={`text-sm ${r.month === currentMonth ? 'font-body-bold text-accent' : 'font-body-semibold text-ink'}`}>
                {monthLabel(r.month)}
              </Text>
            </View>
          ))}
          <View className={`${ROW} border-t border-gridline bg-surface-2 px-3`}>
            <Text className="font-body-bold text-sm text-ink">Total</Text>
          </View>
        </View>
        <ScrollView horizontal className="flex-1">
          <View>
            <View className="flex-row bg-surface-2">
              {headers.map((h, i) => (
                <View key={i} className={`${AMOUNT_COL} ${ROW} flex-row items-center justify-end gap-1 px-3`}>
                  {i > 0 && <CategoryMark color={series[i - 1].color} size={8} />}
                  <Text numberOfLines={1} className="shrink font-body-semibold text-xs uppercase text-ink-muted">
                    {h}
                  </Text>
                </View>
              ))}
            </View>
            {rows.map((r) => (
              <View
                key={r.month}
                className={`flex-row border-t border-gridline ${r.month === currentMonth ? 'bg-accent-soft' : ''}`}
              >
                {r.cells.map((v, i) => (
                  <View key={i} className={`${AMOUNT_COL} ${ROW} px-3`}>
                    <Text
                      className={`text-right font-mono text-sm ${Math.round(v) === 0 ? 'text-ink-muted' : i === 0 ? 'font-bold text-ink' : i === 3 ? 'font-body-semibold text-ink' : 'text-ink'}`}
                    >
                      {num(v)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <View className="flex-row border-t border-gridline bg-surface-2">
              {totals.map((v, i) => (
                <View key={i} className={`${AMOUNT_COL} ${ROW} px-3`}>
                  <Text className="text-right font-mono text-sm font-bold text-ink">{num(v)}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </Card>

      <Text className="font-body text-xs leading-[1.5] text-ink-muted">
        Months before today are your real checked history; the rest is projected from your current rules. Debt is
        bills that have a last payment date; Expenses is the rest. Money staying is all the fund columns added
        together. Months beyond your next payday assume today's income, bills and rules stay the same.
      </Text>
    </View>
  );
}
