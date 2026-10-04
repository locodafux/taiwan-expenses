import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Card, CategoryMark } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Heading';
import { ErrorState } from '@/components/ui/ErrorState';
import { useMonthlyCells } from '@/lib/monthlyCells';
import { addMonths, appToday, fromDateOnly, scheduledMonthTotal, toDateOnly } from '@/lib/payday';
import { useHouseholdMembership, useIncomes } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

// Mirrors taiwan-fund-planner.html's "Full numbers" table (now the Dashboard's Yearly Cashflow): October 2026 through
// September 2029 (the forecast RPC's 36-month cap) is loaded, shown one calendar year at a time, one row per month. Amounts come from useMonthlyCells (the same
// calculation as the Breakdown chart), so this only lays them out.
const FIRST_MONTH = '2026-10';
const MONTHS = Array.from({ length: 36 }, (_, i) => addMonths(FIRST_MONTH, i));

// Fixed row height, border included: a border added on top of an h-10 child made rows 1px taller each, so months drifted out of line with their numbers.
const ROW_H = 'h-10';
// Headers get a taller row; the Month header uses it too so both sides stay level.
const HEAD = 'h-12';
// No sideways scrolling: the month column is a fixed 44px and every amount column shares the rest of the width equally.
const MONTH_COL = 'shrink-0 justify-center pl-2';
const MONTH_W = { width: 44 };
const AMOUNT_COL = 'flex-1';

// Columns are ~35px wide on a phone, so cells use a compact form ("11.8k", "240k", "1.2M"); the full pesos are one tap away in the list under the table.
const num = (n: number) => {
  const r = Math.round(n);
  if (r === 0) return '–';
  const abs = Math.abs(r);
  if (abs < 1000) return String(r);
  if (abs < 999500) return `${+(r / 1000).toFixed(abs < 100000 ? 1 : 0)}k`;
  return `${+(r / 1e6).toFixed(abs < 1e8 ? 1 : 0)}M`;
};
const full = (n: number) => (Math.round(n) === 0 ? '–' : Math.round(n).toLocaleString());

function monthLabel(month: string) {
  const d = fromDateOnly(`${month}-01`);
  return `${d.toLocaleDateString(undefined, { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

// Header text for a column that is only ~35px wide: the colour dot and these few letters, with the full name in the list below.
const SHORT: Record<string, string> = { Income: 'Inc', Expenses: 'Exp', 'Money staying': 'Stay' };
const short = (label: string) => SHORT[label] ?? label.slice(0, 4);

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
  // Column headers after Income, each with its color.
  const series = [
    { label: 'Expenses', color: vars['--cat-expenses'] },
    { label: 'Debt', color: vars['--cat-debt'] },
    { label: 'Money staying', color: vars['--accent'] },
    ...funds.map((c) => ({ label: c.name, color: c.color ?? vars['--ink-muted'] })),
  ];
  const headers = ['Income', ...series.map((s) => s.label)];
  const currentMonth = toDateOnly(appToday()).slice(0, 7);
  // One calendar year at a time (today's year to start), with arrows over the 36-month window's years.
  const years = [...new Set(MONTHS.map((m) => Number(m.slice(0, 4))))];
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? years.find((y) => y >= Number(currentMonth.slice(0, 4))) ?? years[0];
  const yearIndex = years.indexOf(year);
  const shown = rows.filter((r) => r.month.startsWith(`${year}-`));
  const totals = (shown[0]?.cells ?? []).map((_, col) => shown.reduce((sum, r) => sum + r.cells[col], 0));
  // Tapping a row (or the Total row) lists its full peso amounts under the table.
  const [selected, setSelected] = useState<string | null>(null);
  const picks = [...shown.map((r) => ({ key: r.month, label: monthLabel(r.month), cells: r.cells })), { key: 'total', label: `Total '${String(year).slice(2)}`, cells: totals }];
  const pick = picks.find((p) => p.key === selected);

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
        <View className="flex-row items-center justify-between">
          <Text className="font-body text-sm text-ink-muted">
            {year} · amounts in pesos
          </Text>
          <View className="flex-row items-center gap-1">
            <YearArrow label="Previous year" glyph="‹" disabled={yearIndex <= 0} onPress={() => setPicked(years[yearIndex - 1])} />
            <YearArrow label="Next year" glyph="›" disabled={yearIndex >= years.length - 1} onPress={() => setPicked(years[yearIndex + 1])} />
          </View>
        </View>
      </View>

      <Card className="overflow-hidden">
        <View className={`${HEAD} flex-row bg-surface-2`}>
          <View className={MONTH_COL} style={MONTH_W}>
            <Text className="font-body-semibold text-[9px] uppercase text-ink-muted">Month</Text>
          </View>
          {headers.map((h, i) => (
            <View key={i} className={`${AMOUNT_COL} items-center justify-center gap-1`}>
              {i > 0 ? <CategoryMark color={series[i - 1].color} size={8} /> : <View className="h-2" />}
              <Text numberOfLines={1} adjustsFontSizeToFit className="font-body-semibold text-[9px] uppercase text-ink-muted">
                {short(h)}
              </Text>
            </View>
          ))}
        </View>
        {picks.map((p, n) => {
          const isTotal = p.key === 'total';
          const isNow = p.key === currentMonth;
          return (
            <Pressable
              key={p.key}
              accessibilityRole="button"
              accessibilityLabel={`${p.label} full amounts`}
              onPress={() => setSelected(p.key === selected ? null : p.key)}
              className={`${ROW_H} flex-row border-t border-gridline ${isTotal ? 'bg-surface-2' : isNow ? 'bg-accent-soft' : ''} ${p.key === selected ? 'bg-surface-2' : ''}`}
            >
              <View className={MONTH_COL} style={MONTH_W}>
                <Text
                  numberOfLines={1}
                  className={`text-xs ${isTotal ? 'font-body-bold text-ink' : isNow ? 'font-body-bold text-accent' : 'font-body-semibold text-ink'}`}
                >
                  {isTotal ? 'Total' : p.label.split(' ')[0]}
                </Text>
              </View>
              {p.cells.map((v, i) => (
                <View key={i} className={`${AMOUNT_COL} justify-center`}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    className={`text-center font-mono text-[10px] ${Math.round(v) === 0 ? 'text-ink-muted' : isTotal || i === 0 ? 'font-bold text-ink' : i === 3 ? 'font-body-semibold text-ink' : 'text-ink'}`}
                  >
                    {num(v)}
                  </Text>
                </View>
              ))}
            </Pressable>
          );
        })}
      </Card>

      <Card className="gap-2 p-3">
        <Text className="font-body-semibold text-xs uppercase text-ink-muted">
          {pick ? `${pick.label} · full amounts` : 'Columns · tap a row above for full amounts'}
        </Text>
        {headers.map((h, i) => (
          <View key={i} className="flex-row items-center gap-2">
            {i > 0 ? <CategoryMark color={series[i - 1].color} size={8} /> : <View className="h-2 w-2 shrink-0" />}
            <Text className="flex-1 font-body text-sm text-ink">{h}</Text>
            {pick && <Text className="font-mono text-sm text-ink">{full(pick.cells[i])}</Text>}
          </View>
        ))}
      </Card>

      <Text className="font-body text-xs leading-[1.5] text-ink-muted">
        Months before today are your real checked history; the rest is projected from your current rules. Debt is
        bills that have a last payment date; Expenses is the rest. Money staying is all the fund columns added
        together. Months beyond your next payday assume today&apos;s income, bills and rules stay the same.
      </Text>
    </View>
  );
}

function YearArrow({ label, glyph, disabled, onPress }: { label: string; glyph: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-8 w-8 items-center justify-center rounded-full bg-surface-2 ${disabled ? 'opacity-40' : ''}`}
    >
      <Text className="font-body-bold text-lg text-ink">{glyph}</Text>
    </Pressable>
  );
}
