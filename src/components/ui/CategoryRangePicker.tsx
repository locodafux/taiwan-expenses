import { Text, View } from 'react-native';

import { MonthPicker } from '@/components/ui/MonthPicker';
import { APP_START_MONTH } from '@/lib/payday';

// A category's Start month (never before the app's October 2026 start), as
// 'YYYY-MM'; callers store it as the 1st of the month.
export function CategoryRangePicker({ start, onChange }: { start: string; onChange: (start: string) => void }) {
  return (
    <View className="gap-2">
      <Text className="font-body text-xs text-ink-muted">Starts</Text>
      <MonthPicker
        value={start}
        min={APP_START_MONTH}
        clearable={false}
        onChange={(m) => onChange(m ?? APP_START_MONTH)}
      />
      <Text className="font-body text-xs leading-[1.4] text-ink-muted">
        Before this month this category gets no money set aside and no bills.
      </Text>
    </View>
  );
}
