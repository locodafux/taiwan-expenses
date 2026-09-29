import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Meter } from '@/components/ui/ProgressBar';
import { formatPeso } from '@/lib/format';
import { PLAN_MONTHS, buildPlan, total, validatePlan, type PlannedPayday } from '@/lib/paydayPlan';
import { fromDateOnly, toDateOnly } from '@/lib/payday';
import { useTheme } from '@/theme/ThemeProvider';
import { PAYDAY_PINK } from '@/theme/tokens';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthTitle(month: string) {
  return fromDateOnly(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dateTitle(id: string) {
  return fromDateOnly(id).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// 20000 -> "20k", 1240 -> "1.2k": a payday cell is only ~44px wide on a phone.
function compact(n: number) {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

// A coloured group of labelled amounts (Income, Expenses, Debt, Taiwan ...).
function Section({
  title,
  color,
  titleColor,
  rows,
  totalLabel,
  children,
}: {
  title: string;
  color: string;
  titleColor?: string;
  rows?: { label: string; amount: number }[];
  totalLabel?: string;
  children?: React.ReactNode;
}) {
  const sum = (rows ?? []).reduce((s, r) => s + r.amount, 0);
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: color }} className="gap-1 py-1 pl-4">
      <Text style={{ color: titleColor ?? color }} className="font-body-semibold text-xs uppercase tracking-widest">
        {title}
      </Text>
      {rows?.length === 0 && <Text className="font-body text-sm italic text-ink-muted">None this payday</Text>}
      {rows?.map((r) => (
        <View key={r.label} className="flex-row justify-between gap-3">
          <Text className="flex-1 font-body text-sm text-ink-2">{r.label}</Text>
          <Text className="font-mono text-sm text-ink">{formatPeso(r.amount)}</Text>
        </View>
      ))}
      {totalLabel && rows && rows.length > 0 && (
        <View className="flex-row justify-between gap-3 border-t border-gridline pt-1">
          <Text className="flex-1 font-body-semibold text-sm text-ink">{totalLabel}</Text>
          <Text className="font-mono-semibold text-sm text-ink">{formatPeso(sum)}</Text>
        </View>
      )}
      {children}
    </View>
  );
}

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="flex-1 font-body text-sm text-ink-2">{label}</Text>
      <Text className="font-mono text-sm text-ink">{formatPeso(amount)}</Text>
    </View>
  );
}

// The Breakdown screen's payday planner: Oct 2026 - Mar 2027 calendar, the
// selected payday's full split underneath, then that month's summary (only
// ever the sum of its paydays). Fixed schedule - see src/lib/paydayPlan.ts.
export function PaydayCalendar() {
  const { vars: themeVars } = useTheme();
  const vars = { ...themeVars, ...PAYDAY_PINK };
  const plan = useMemo(() => buildPlan(), []);
  const issues = useMemo(() => validatePlan(plan), [plan]);
  const paydayById = useMemo(() => new Map(plan.paydays.map((p) => [p.id, p])), [plan]);

  const todayId = toDateOnly(new Date());
  const [monthIndex, setMonthIndex] = useState(() => Math.max(0, PLAN_MONTHS.indexOf(todayId.slice(0, 7))));
  const [selectedId, setSelectedId] = useState(() =>
    PLAN_MONTHS.includes(todayId.slice(0, 7)) ? todayId : `${PLAN_MONTHS[0]}-05`,
  );

  const month = PLAN_MONTHS[monthIndex];
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leadingBlanks = new Date(year, monthNumber - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  function goToMonth(index: number, id?: string) {
    setMonthIndex(index);
    setSelectedId(id ?? `${PLAN_MONTHS[index]}-05`);
  }
  function goToday() {
    const index = PLAN_MONTHS.indexOf(todayId.slice(0, 7));
    if (index >= 0) goToMonth(index, todayId);
    else goToMonth(todayId < PLAN_MONTHS[0] ? 0 : PLAN_MONTHS.length - 1);
  }

  const selected = paydayById.get(selectedId);
  const monthPaydays = plan.paydays.filter((p) => p.month === selectedId.slice(0, 7));
  const summaryMonth = selectedId.slice(0, 7);
  const monthIssues = issues.filter((i) => i.scope === summaryMonth || i.scope.startsWith(`${summaryMonth}-`));
  const lastOfMonth = monthPaydays[monthPaydays.length - 1];

  const color = {
    income: vars['--status-good'],
    expenses: vars['--cat-expenses'],
    debt: vars['--cat-debt'],
    taiwan: vars['--cat-taiwan'],
    emergency: vars['--cat-emergency'],
    savings: vars['--cat-savings'],
    excess: vars['--cat-excess'],
    // pink is a fill tone; pink section titles are set in Deep Rose for contrast
    pinkText: vars['--accent'],
  };

  return (
    <ScrollView contentContainerClassName="gap-4 px-6 pb-10 pt-2">
      <Card className="gap-2 p-5">
        <View className="flex-row flex-wrap items-baseline justify-between gap-2">
          <Text style={{ color: color.pinkText }} className="font-body-semibold text-xs uppercase tracking-widest">
            Taiwan Fund plan · trip March 2027
          </Text>
          <Text className="font-mono text-sm text-ink">
            {formatPeso(plan.taiwanTotal)} <Text className="font-body text-ink-muted">of {formatPeso(plan.target)}</Text>
          </Text>
        </View>
        <Meter percent={(plan.taiwanTotal / plan.target) * 100} color={color.taiwan} />
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="font-body text-xs text-ink-muted">Planned total, reached by the last March payday</Text>
          <Text
            style={{ color: issues.length ? vars['--status-bad'] : vars['--status-good'] }}
            className="font-body-semibold text-xs"
          >
            {issues.length ? `${issues.length} check${issues.length > 1 ? 's' : ''} failing` : 'All checks pass'}
          </Text>
        </View>
      </Card>

      <Card className="gap-3 p-4">
        <View className="flex-row items-center justify-between gap-2">
          <Text accessibilityRole="header" className="flex-1 font-display-semibold text-lg text-ink">
            {monthTitle(month)}
          </Text>
          <Pressable
            onPress={() => goToMonth(monthIndex - 1)}
            disabled={monthIndex === 0}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className={`p-2 ${monthIndex === 0 ? 'opacity-30' : ''}`}
          >
            <Icon name="chevronLeft" size={18} color={vars['--ink-2']} />
          </Pressable>
          <Pressable onPress={goToday} hitSlop={10} accessibilityRole="button" className="px-2 py-2">
            <Text className="font-body-semibold text-sm text-accent">Today</Text>
          </Pressable>
          <Pressable
            onPress={() => goToMonth(monthIndex + 1)}
            disabled={monthIndex === PLAN_MONTHS.length - 1}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className={`p-2 ${monthIndex === PLAN_MONTHS.length - 1 ? 'opacity-30' : ''}`}
          >
            <Icon name="chevronRight" size={18} color={vars['--ink-2']} />
          </Pressable>
        </View>

        <View className="flex-row gap-1">
          {WEEKDAYS.map((d, i) => (
            <Text key={i} className="flex-1 text-center font-body-semibold text-xs text-ink-muted">
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} className="flex-row gap-1">
            {week.map((day, i) => {
              if (day === null) return <View key={i} className="flex-1" />;
              const id = `${month}-${String(day).padStart(2, '0')}`;
              const payday = paydayById.get(id);
              const isSelected = id === selectedId;
              const isToday = id === todayId;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSelectedId(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={
                    payday
                      ? `${dateTitle(id)}, ${payday.who} payday ${formatPeso(payday.income)}, ${
                          payday.expenses.length + payday.debts.length
                        } payments, ${formatPeso(payday.excess)} left`
                      : dateTitle(id)
                  }
                  style={{ borderColor: isSelected ? vars['--accent'] : payday ? vars['--pink'] : 'transparent' }}
                  className={`min-h-[64px] flex-1 items-center gap-[2px] rounded-md border px-[2px] py-1 ${
                    payday ? 'bg-accent-soft' : ''
                  } ${isSelected ? 'border-2' : ''}`}
                >
                  <Text
                    className={`font-body-semibold text-sm ${
                      isToday || payday ? 'text-accent' : 'text-ink-2'
                    } ${isToday ? 'underline' : ''}`}
                  >
                    {day}
                  </Text>
                  {payday && (
                    <>
                      <Text numberOfLines={1} adjustsFontSizeToFit className="font-mono-semibold text-[10px] text-ink">
                        💰{compact(payday.income)}
                      </Text>
                      <Text numberOfLines={1} adjustsFontSizeToFit className="font-body text-[9px] text-ink-muted">
                        {payday.expenses.length + payday.debts.length} due
                      </Text>
                      <Text numberOfLines={1} adjustsFontSizeToFit className="font-body text-[9px] text-ink-muted">
                        {compact(payday.excess)} left
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text className="font-body text-xs text-ink-muted">
          Paydays are the 5th, 15th, 20th and 30th (28th in February). Tap one to see its split.
        </Text>
      </Card>

      <Card className="gap-4 p-5">
        {selected ? <PaydayDetail payday={selected} plan={plan} color={color} issues={issues} /> : (
          <View className="gap-1">
            <Text className="font-body-semibold text-xs uppercase tracking-widest text-ink-muted">
              {dateTitle(selectedId)}
            </Text>
            <Text className="font-display-semibold text-lg text-ink">No scheduled payday</Text>
            <Text className="font-body text-sm text-ink-2">Nothing comes in or goes out on this date.</Text>
          </View>
        )}
      </Card>

      <Card className="gap-4 p-5">
        <View className="gap-1">
          <Text className="font-body-semibold text-xs uppercase tracking-widest text-ink-muted">
            Monthly summary · sum of the four paydays
          </Text>
          <Text className="font-display-semibold text-lg text-ink">{monthTitle(summaryMonth)}</Text>
        </View>
        <Section title="Income" color={color.income}>
          <AmountRow label="Total" amount={total(monthPaydays, 'income')} />
        </Section>
        <Section title="Expenses" color={color.expenses}>
          <AmountRow label="Total" amount={total(monthPaydays, 'expenseTotal')} />
        </Section>
        <Section title="Debt" color={color.debt}>
          <AmountRow label="Total" amount={total(monthPaydays, 'debtTotal')} />
        </Section>
        <Section title="Taiwan Fund" color={color.taiwan} titleColor={color.pinkText}>
          <AmountRow label="This month" amount={total(monthPaydays, 'taiwan')} />
          <AmountRow label="Saved by end of month" amount={lastOfMonth.taiwanCumulative} />
        </Section>
        <Section title="Emergency Fund" color={color.emergency} titleColor={color.pinkText}>
          <AmountRow label="Total" amount={total(monthPaydays, 'emergency')} />
        </Section>
        <Section title="Savings" color={color.savings} titleColor={color.pinkText}>
          <AmountRow label="Total" amount={total(monthPaydays, 'savings')} />
        </Section>
        <Section title="Excess / Remaining" color={color.excess}>
          <AmountRow label="Total" amount={total(monthPaydays, 'excess')} />
        </Section>
        <Text
          style={{ color: monthIssues.length ? vars['--status-bad'] : vars['--status-good'] }}
          className="font-body-semibold text-xs"
        >
          {monthIssues.length ? '⚠ This month does not add up' : '✓ Payday totals match the month'}
        </Text>
      </Card>

      {issues.length > 0 && (
        <Card className="gap-1 p-5">
          <Text style={{ color: vars['--status-bad'] }} className="font-body-semibold text-sm">
            Calculation checks failing
          </Text>
          {issues.map((i, n) => (
            <Text key={n} className="font-body text-sm text-ink-2">
              {i.scope}: {i.message}
            </Text>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function PaydayDetail({
  payday: p,
  plan,
  color,
  issues,
}: {
  payday: PlannedPayday;
  plan: ReturnType<typeof buildPlan>;
  color: Record<string, string>;
  issues: { scope: string; message: string }[];
}) {
  const { vars } = useTheme();
  const own = issues.filter((i) => i.scope === p.id);
  return (
    <>
      <View className="gap-1">
        <Text className="font-body-semibold text-xs uppercase tracking-widest text-ink-muted">Selected payday</Text>
        <Text className="font-display-semibold text-lg text-ink">
          {fromDateOnly(p.id).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · {p.who} payday
        </Text>
        <Text style={{ color: own.length ? vars['--status-bad'] : vars['--status-good'] }} className="font-body-semibold text-xs">
          {own.length ? own.map((i) => i.message).join('; ') : `✓ ${formatPeso(p.income)} fully allocated`}
        </Text>
      </View>
      <Section title="Income" color={color.income}>
        <Text className="font-display text-xl text-ink">{formatPeso(p.income)}</Text>
      </Section>
      <Section
        title="Expenses"
        color={color.expenses}
        rows={p.expenses.map((e) => ({ label: e.name, amount: e.amount }))}
        totalLabel="Total expenses"
      />
      <Section
        title="Debt"
        color={color.debt}
        rows={p.debts.map((d) => ({ label: d.name, amount: d.amount }))}
        totalLabel="Total debt"
      />
      <Section title="Taiwan Fund" color={color.taiwan} titleColor={color.pinkText}>
        <AmountRow label="This payday" amount={p.taiwan} />
        <AmountRow label="Saved so far" amount={p.taiwanCumulative} />
        <AmountRow label="Still to go" amount={Math.max(0, plan.target - p.taiwanCumulative)} />
        <Meter percent={(p.taiwanCumulative / plan.target) * 100} color={color.taiwan} thin className="mt-1" />
      </Section>
      <Section title="Emergency Fund" color={color.emergency} titleColor={color.pinkText}>
        <AmountRow label="This payday" amount={p.emergency} />
      </Section>
      <Section title="Savings" color={color.savings} titleColor={color.pinkText}>
        <AmountRow label="This payday" amount={p.savings} />
      </Section>
      <Section title="Excess / Remaining" color={color.excess}>
        <Text className="font-display text-xl text-ink">{formatPeso(p.excess)}</Text>
      </Section>
    </>
  );
}
