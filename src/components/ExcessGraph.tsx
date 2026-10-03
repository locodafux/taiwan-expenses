import { Text, View } from 'react-native';

import type { Category } from '@/lib/database.types';
import { MONTHS } from '@/components/FullNumbersTable';
import { formatPeso } from '@/lib/format';
import { useMonthlyCells } from '@/lib/monthlyCells';
import { fromDateOnly } from '@/lib/payday';
import { PAYDAY_PINK } from '@/theme/tokens';

function monthLabel(month: string) {
  const d = fromDateOnly(`${month}-01`);
  return `${d.toLocaleDateString(undefined, { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

// The group parent's own amount (the money staying in it after its linked funds take their share), one bar per
// month: same amounts as the parent's Yearly Cashflow column, via useMonthlyCells. Same bar style as the Breakdown
// month chart. Renders nothing while loading, on error, or when no month has money, so it never breaks the summary.
export function ExcessGraph({ parent }: { parent: Category }) {
  const { isLoading, isError, cellValue } = useMonthlyCells(MONTHS);
  if (isLoading || isError) return null;

  const rows = MONTHS.map((month) => ({ month, amount: cellValue(parent, month) }));
  // Only for scaling bar lengths against each other.
  const maxBar = Math.max(...rows.map((r) => r.amount));
  if (maxBar <= 0) return null;
  const color = parent.color ?? PAYDAY_PINK['--accent'];

  return (
    <View testID="excess-graph" className="gap-3">
      <Text className="font-body-semibold text-xs uppercase tracking-widest text-ink-muted">
        {parent.name} by month
      </Text>
      <View className="gap-2">
        {rows.map((r) => (
          <View key={r.month} className="flex-row items-center gap-3">
            <Text className="w-14 font-body-semibold text-xs text-ink">{monthLabel(r.month)}</Text>
            <View className="flex-1 flex-row items-center gap-2">
              <View style={{ width: `${(r.amount / maxBar) * 70}%`, backgroundColor: color }} className="h-4 rounded-sm" />
              <Text className="font-mono text-xs text-ink-2">{r.amount > 0 ? formatPeso(r.amount) : '–'}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
