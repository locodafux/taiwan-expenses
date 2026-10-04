import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

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

const MONTH_COL = 'w-20';
const AMOUNT_COL = 'w-32';
// Fixed row height, border included, on both the month column and the amount rows: a border added on top of an h-10 child made
// the amount rows 1px taller each, so the months drifted out of line with their numbers further down.
const ROW_H = 'h-10';
const ROW = `${ROW_H} justify-center`;
// Headers get a taller row so a long fund name wraps to two lines instead of being cut off; the Month header uses it too so both sides stay level.
const HEAD = 'h-12 justify-center';

// Amounts are in pesos (the subtitle says so once), so the cells drop the repeated ₱ and a zero reads as a dash.
const num = (n: number) => (Math.round(n) === 0 ? '–' : Math.round(n).toLocaleString());

function monthLabel(month: string) {
  const d = fromDateOnly(`${month}-01`);
  return `${d.toLocaleDateString(undefined, { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

// The Dashboard's "Yearly Cashflow" section: the table of income, expenses, debt and every fund, month by month.
export function FullNumbersTable({ onExpand }: { onExpand?: () => void } = {}) {
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
  // The Total row runs on from the first month of the window through the last month of the shown year, so each year page
  // continues the one before it without counting a month twice.
  const endMonth = shown[shown.length - 1].month;
  const upTo = rows.filter((r) => r.month <= endMonth);
  const totals = (rows[0]?.cells ?? []).map((_, col) => upTo.reduce((sum, r) => sum + r.cells[col], 0));

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
    <CashflowTable
      year={year}
      headers={headers}
      colors={series.map((s) => s.color)}
      rows={shown}
      totals={totals}
      currentMonth={currentMonth}
      onPrev={yearIndex > 0 ? () => setPicked(years[yearIndex - 1]) : undefined}
      onNext={yearIndex < years.length - 1 ? () => setPicked(years[yearIndex + 1]) : undefined}
      onExpand={onExpand}
    />
  );
}

type TableProps = {
  year: number;
  headers: string[];
  colors: string[]; // one per header after Income
  rows: { month: string; cells: number[] }[];
  totals: number[];
  currentMonth: string;
  onPrev?: () => void; // undefined = at the end of the window
  onNext?: () => void;
  onExpand?: () => void; // Dashboard only: opens the landscape screen
};

const FOOTNOTE =
  'Months before today are your real checked history; the rest is projected from your current rules. Debt is bills that have a last payment date; Expenses is the rest. Money staying is all the fund columns added together. Months beyond your next payday assume today\'s income, bills and rules stay the same.';

// Sideways (the Cashflow screen turns the phone landscape): every column shares the width so nothing scrolls sideways;
// upright it is the wide table with its own sideways scroll, plus a button to the sideways view when onExpand is given.
export function CashflowTable({ year, headers, colors, rows: shown, totals, currentMonth, onPrev, onNext, onExpand }: TableProps) {
  const { width, height } = useWindowDimensions();
  const wide = width > height;

  if (wide) {
    // 10px type, full names and amounts; headers wrap at spaces only because every column is wide enough for its longest word.
    const cell = 'flex-1 justify-center px-1';
    return (
      <ScrollView className="flex-1" contentContainerClassName="gap-2 pb-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-body-semibold text-sm text-ink">
            Yearly Cashflow · {year} · pesos
          </Text>
          <View className="flex-row items-center gap-1">
            <YearArrow label="Previous year" glyph="‹" disabled={!onPrev} onPress={() => onPrev?.()} />
            <YearArrow label="Next year" glyph="›" disabled={!onNext} onPress={() => onNext?.()} />
          </View>
        </View>
        <Card className="overflow-hidden">
          <View className="h-11 flex-row bg-surface-2">
            <View className="w-16 justify-center px-1">
              <Text className="font-body-semibold text-[10px] text-ink-muted">Month</Text>
            </View>
            {headers.map((h, i) => (
              <View key={i} className={`${cell} items-end gap-0.5`}>
                {i > 0 && <CategoryMark color={colors[i - 1]} size={7} />}
                <Text className="text-right font-body-semibold text-[10px] leading-[12px] text-ink-muted">{h}</Text>
              </View>
            ))}
          </View>
          {shown.map((r) => (
            <View
              key={r.month}
              className={`h-[22px] flex-row border-t border-gridline ${r.month === currentMonth ? 'bg-accent-soft' : ''}`}
            >
              <View className="w-16 justify-center px-1">
                <Text className={`text-[10px] ${r.month === currentMonth ? 'font-body-bold text-accent' : 'font-body-semibold text-ink'}`}>
                  {monthLabel(r.month)}
                </Text>
              </View>
              {r.cells.map((v, i) => (
                <View key={i} className={cell}>
                  <Text numberOfLines={1} className={`text-right font-mono text-[10px] ${amountTone(v, i)}`}>{num(v)}</Text>
                </View>
              ))}
            </View>
          ))}
          <View className="h-[22px] flex-row border-t border-gridline bg-surface-2">
            <View className="w-16 justify-center px-1">
              <Text className="font-body-bold text-[10px] text-ink">Total</Text>
            </View>
            {totals.map((v, i) => (
              <View key={i} className={cell}>
                <Text numberOfLines={1} className="text-right font-mono text-[10px] font-bold text-ink">{num(v)}</Text>
              </View>
            ))}
          </View>
        </Card>
        <Text className="font-body text-[10px] leading-[14px] text-ink-muted">{FOOTNOTE}</Text>
      </ScrollView>
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
            <YearArrow label="Previous year" glyph="‹" disabled={!onPrev} onPress={() => onPrev?.()} />
            <YearArrow label="Next year" glyph="›" disabled={!onNext} onPress={() => onNext?.()} />
          </View>
        </View>
        {onExpand && (
          <Pressable accessibilityRole="button" onPress={onExpand} className="self-start rounded-pill bg-surface-2 px-3 py-1.5">
            <Text className="font-body-semibold text-xs text-accent">See every column at once (landscape)</Text>
          </Pressable>
        )}
      </View>

      <Card className="flex-row overflow-hidden">
        {/* Month column stays put while the amounts scroll sideways. */}
        <View className={`${MONTH_COL} border-r border-gridline`}>
          <View className={`${HEAD} bg-surface-2 px-3`}>
            <Text className="font-body-semibold text-xs uppercase text-ink-muted">Month</Text>
          </View>
          {shown.map((r) => (
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
                <View key={i} className={`${AMOUNT_COL} ${HEAD} flex-row items-center justify-end gap-1.5 px-3`}>
                  {i > 0 && <CategoryMark color={colors[i - 1]} size={8} />}
                  <Text numberOfLines={2} className="shrink text-right font-body-semibold text-xs uppercase text-ink-muted">
                    {h}
                  </Text>
                </View>
              ))}
            </View>
            {shown.map((r) => (
              <View
                key={r.month}
                className={`${ROW_H} flex-row border-t border-gridline ${r.month === currentMonth ? 'bg-accent-soft' : ''}`}
              >
                {r.cells.map((v, i) => (
                  <View key={i} className={`${AMOUNT_COL} justify-center px-3`}>
                    <Text className={`text-right font-mono text-sm ${amountTone(v, i)}`}>
                      {num(v)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <View className={`${ROW_H} flex-row border-t border-gridline bg-surface-2`}>
              {totals.map((v, i) => (
                <View key={i} className={`${AMOUNT_COL} justify-center px-3`}>
                  <Text className="text-right font-mono text-sm font-bold text-ink">{num(v)}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </Card>

      <Text className="font-body text-xs leading-[1.5] text-ink-muted">{FOOTNOTE}</Text>
    </View>
  );
}

// Income bold, Money staying semibold, zero muted.
const amountTone = (v: number, i: number) =>
  Math.round(v) === 0 ? 'text-ink-muted' : i === 0 ? 'font-bold text-ink' : i === 3 ? 'font-body-semibold text-ink' : 'text-ink';

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
