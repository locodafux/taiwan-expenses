import { Text, View } from 'react-native';

import { MonthPicker } from '@/components/ui/MonthPicker';
import { APP_START_MONTH } from '@/lib/payday';

// A category's Start month (never before the app's October 2026 start) and
// optional End month (its last month; never before Start). Months are
// 'YYYY-MM'; callers store them as the 1st of the month.
export function CategoryRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string | null;
  onChange: (range: { start: string; end: string | null }) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="font-body text-xs text-ink-muted">Starts</Text>
      <MonthPicker
        value={start}
        min={APP_START_MONTH}
        clearable={false}
        onChange={(m) => {
          const next = m ?? APP_START_MONTH;
          onChange({ start: next, end: end && end < next ? next : end });
        }}
      />
      <Text className="font-body text-xs text-ink-muted">Last month (optional)</Text>
      <MonthPicker
        value={end}
        min={start}
        emptyLabel="No end · set a last month"
        onChange={(m) => onChange({ start, end: m })}
      />
      <Text className="font-body text-xs leading-[1.4] text-ink-muted">
        Outside these months this category gets no money set aside and no bills.
      </Text>
    </View>
  );
}
