import { Text, View } from 'react-native';

export function ProgressBar({
  label,
  amountLabel,
  percent,
}: {
  label: string;
  amountLabel: string;
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View>
      <View className="mb-3 flex-row flex-wrap items-center justify-between gap-3">
        <Text className="font-body text-sm text-ink-2">{label}</Text>
        <Text className="font-body text-sm text-ink-2">{amountLabel}</Text>
      </View>
      <View
        className="h-2 overflow-hidden rounded-full bg-surface-3"
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
      >
        <View className="h-full rounded-full bg-status-good" style={{ width: `${clamped}%` }} />
      </View>
    </View>
  );
}
