import { useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { parseAmount } from '@/lib/format';
import type { Category } from '@/lib/database.types';
import { addMonths, appToday, toDateOnly } from '@/lib/payday';
import { useCategoryMonthPercents, useSetMonthPercent } from '@/lib/queries';

const MONTHS_SHOWN = 12;

// A group child's percentage for each upcoming month. Blank = its usual
// percentage; a number (0 allowed) replaces it for that month only.
export function MonthlyPercentCard({
  category,
  householdId,
  defaultPercent,
}: {
  category: Category;
  householdId: string | undefined;
  defaultPercent: number;
}) {
  const overridesQuery = useCategoryMonthPercents(householdId);
  const setMonthPercent = useSetMonthPercent(householdId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const overrides = new Map(
    (overridesQuery.data ?? []).filter((o) => o.category_id === category.id).map((o) => [o.month.slice(0, 7), o.percent]),
  );
  const thisMonth = toDateOnly(appToday()).slice(0, 7);
  const first = category.start_month.slice(0, 7) > thisMonth ? category.start_month.slice(0, 7) : thisMonth;
  const last = category.end_month?.slice(0, 7);
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonths(first, i)).filter((m) => !last || m <= last);

  async function save(month: string) {
    const text = (drafts[month] ?? '').trim();
    const current = overrides.get(month);
    const percent = text === '' ? null : parseAmount(text);
    if (percent !== null && !(percent >= 0 && percent <= 100)) {
      return setError('Enter a percentage between 0 and 100');
    }
    if (percent === (current ?? null)) return;
    setError(null);
    try {
      await setMonthPercent.mutateAsync({ categoryId: category.id, month: `${month}-01`, percent });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that percentage');
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
        return (
          <View key={month} className="flex-row items-center justify-between gap-3">
            <Text className="font-body text-sm text-ink">
              {new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </Text>
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
        );
      })}
      {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}
    </Card>
  );
}
