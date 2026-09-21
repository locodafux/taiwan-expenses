import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';

// value is 'YYYY-MM' or null (never ends). Steps a month at a time, never
// before `min`.
export function MonthPicker({
  value,
  min,
  onChange,
  emptyLabel = 'Never ends · set a last month',
}: {
  value: string | null;
  min: string;
  onChange: (month: string | null) => void;
  emptyLabel?: string;
}) {
  if (!value) {
    return (
      <Button variant="secondary" onPress={() => onChange(min)}>
        {emptyLabel}
      </Button>
    );
  }
  const [y, m] = value.split('-').map(Number);
  const step = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    onChange(next < min ? min : next);
  };
  const arrow = 'h-14 w-14 items-center justify-center rounded-md border border-border bg-page';
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={() => step(-1)}
        disabled={value <= min}
        accessibilityLabel="Previous month"
        accessibilityRole="button"
        className={`${arrow} ${value <= min ? 'opacity-40' : ''}`}
      >
        <Text className="font-body text-lg text-ink">‹</Text>
      </Pressable>
      <Text className="flex-1 text-center font-mono text-base text-ink">
        {new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
      </Text>
      <Pressable
        onPress={() => step(1)}
        accessibilityLabel="Next month"
        accessibilityRole="button"
        className={arrow}
      >
        <Text className="font-body text-lg text-ink">›</Text>
      </Pressable>
      <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button">
        <Text className="font-body text-sm text-ink-2">Clear</Text>
      </Pressable>
    </View>
  );
}
