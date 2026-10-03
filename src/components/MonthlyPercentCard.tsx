import { useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { parseAmount } from '@/lib/format';
import type { Category } from '@/lib/database.types';
import { addMonths, appToday, fromDateOnly, groupMonthLeft, toDateOnly } from '@/lib/payday';
import { useCategoryMonthPercents, useSetMonthPercent } from '@/lib/queries';

const MONTHS_SHOWN = 12;

// A group child's percentage for each upcoming month. Blank = its usual
// percentage; a number (0 allowed) replaces it for that month only.
export function MonthlyPercentCard({
  category,
  householdId,
  defaultPercent,
  siblings,
  parentName,
}: {
  category: Category;
  householdId: string | undefined;
  defaultPercent: number;
  // The other children of the same group (each with its default percent).
  siblings: { id: string; name: string; start_month: string; percent: number }[];
  parentName: string;
}) {
  const overridesQuery = useCategoryMonthPercents(householdId);
  const setMonthPercent = useSetMonthPercent(householdId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const allOverrides = new Map((overridesQuery.data ?? []).map((o) => [`${o.category_id}:${o.month.slice(0, 7)}`, o.percent]));
  const overrides = new Map(
    (overridesQuery.data ?? []).filter((o) => o.category_id === category.id).map((o) => [o.month.slice(0, 7), o.percent]),
  );
  const thisMonth = toDateOnly(appToday()).slice(0, 7);
  const first = category.start_month.slice(0, 7) > thisMonth ? category.start_month.slice(0, 7) : thisMonth;
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(first, i));

  // What this month's field would take: what is typed (if it is a valid
  // number), else its saved override, else the default.
  function ownPercent(month: string) {
    const typed = parseAmount((drafts[month] ?? '').trim());
    if ((drafts[month] ?? '').trim() !== '' && typed >= 0 && typed <= 100) return typed;
    return overrides.get(month) ?? defaultPercent;
  }

  function setError(month: string, message: string | null) {
    setErrors((e) => {
      const { [month]: _, ...rest } = e;
      return message ? { ...rest, [month]: message } : rest;
    });
  }

  async function save(month: string) {
    const text = (drafts[month] ?? '').trim();
    const current = overrides.get(month);
    const percent = text === '' ? null : parseAmount(text);
    if (percent !== null && !(percent >= 0 && percent <= 100)) {
      return setError(month, 'Enter a percentage between 0 and 100');
    }
    if (percent === (current ?? null)) return setError(month, null);
    if (percent !== null) {
      const { left } = groupMonthLeft(month, percent, siblings, allOverrides);
      if (left < 0) {
        return setError(month, `Only ${percent + left}% fits here - the other funds in the group already take ${100 - percent - left}% that month.`);
      }
    }
    setError(month, null);
    try {
      await setMonthPercent.mutateAsync({ categoryId: category.id, month: `${month}-01`, percent });
    } catch (e) {
      setError(month, e instanceof Error ? e.message : 'Could not save that percentage');
    }
  }

  return (
    <Card className="gap-2 p-4">
      <Text className="font-body-semibold text-sm text-ink">Percentage by month</Text>
      <Text className="font-body text-xs leading-[1.4] text-ink-muted">
        Leave a month blank to use {defaultPercent}%. Type a number (0 is fine) to change just that month.
        Sibling shares in a month must total 100% or less.
      </Text>
      {months.map((month) => {
        const [y, m] = month.split('-').map(Number);
        const value = drafts[month] ?? (overrides.has(month) ? String(overrides.get(month)) : '');
        const { left, counted, waiting } = groupMonthLeft(month, ownPercent(month), siblings, allOverrides);
        const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        return (
          <View key={month} className="gap-1">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="font-body text-sm text-ink">{monthLabel}</Text>
              <TextField
                accessibilityLabel={`Percentage for ${month}`}
                value={value}
                placeholder={String(defaultPercent)}
                keyboardType="numeric"
                onChangeText={(t) => setDrafts((d) => ({ ...d, [month]: t }))}
                onEndEditing={() => save(month)}
                className="w-24 rounded-md border border-border bg-page px-3 py-2 text-right font-mono text-base text-ink"
              />
            </View>
            <Text className={`font-body text-xs ${left < 0 ? 'text-status-bad' : 'text-ink-muted'}`}>
              {left < 0
                ? `${-left}% over - ${counted.map((s) => `${s.name} ${s.percent}%`).join(', ')}`
                : `${left}% left - stays in ${parentName}`}
              {waiting.length > 0 &&
                ` · ${waiting
                  .map((s) => `${s.name} starts ${fromDateOnly(s.start_month).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`)
                  .join(', ')}`}
            </Text>
            {errors[month] && <Text className="font-body text-sm text-status-bad">{errors[month]}</Text>}
          </View>
        );
      })}
    </Card>
  );
}
