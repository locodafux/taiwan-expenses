import { Text, View } from 'react-native';

// Rounded pill bar - the one progress treatment everywhere (checklist,
// dashboard goals, category detail).
export function Meter({
  percent,
  color,
  thin,
  className,
}: {
  percent: number;
  color?: string;
  thin?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      className={`overflow-hidden rounded-pill bg-surface-3 ${thin ? 'h-[6px]' : 'h-[10px]'} ${className ?? ''}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
    >
      <View
        className={`h-full rounded-pill ${color ? '' : 'bg-status-good'}`}
        style={color ? { width: `${clamped}%`, backgroundColor: color } : { width: `${clamped}%` }}
      />
    </View>
  );
}

export function ProgressBar({
  label,
  amountLabel,
  percent,
}: {
  label: string;
  amountLabel: string;
  percent: number;
}) {
  return (
    <View>
      <View className="mb-2 flex-row flex-wrap items-center justify-between gap-3">
        <Text className="font-body-semibold text-sm text-ink">{label}</Text>
        <Text className="font-body text-sm text-ink-2">{amountLabel}</Text>
      </View>
      <Meter percent={percent} />
    </View>
  );
}
