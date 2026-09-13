import { Pressable, Text, View } from 'react-native';

export function ChecklistRow({
  label,
  amount,
  color,
  checked,
  onToggle,
  onAmountPress,
  onLabelPress,
}: {
  label: string;
  amount: string;
  color: string;
  checked: boolean;
  onToggle: () => void;
  onAmountPress?: () => void;
  onLabelPress?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-gridline py-3">
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        className={`h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${
          checked ? 'border-status-good bg-status-good' : 'border-border'
        }`}
      >
        {checked && <Text className="text-xs text-white">✓</Text>}
      </Pressable>
      <View className="h-[9px] w-[9px] rounded-[3px]" style={{ backgroundColor: color }} />
      <Pressable className="flex-1" onPress={onToggle}>
        <Text
          className={`font-body text-base ${checked ? 'text-ink-muted line-through' : 'text-ink'}`}
        >
          {label}
        </Text>
      </Pressable>
      <Pressable onPress={onAmountPress} disabled={!onAmountPress}>
        <Text className="font-mono text-sm text-ink-2">{amount}</Text>
      </Pressable>
      {onLabelPress && (
        <Pressable onPress={onLabelPress} hitSlop={8}>
          <Text className="text-ink-muted">›</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ChecklistGroup({
  heading,
  note,
  children,
}: {
  heading: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-7">
      <Text className="font-body-bold text-sm text-ink">{heading}</Text>
      {note && <Text className="mb-3 mt-[2px] font-body text-xs text-ink-muted">{note}</Text>}
      {children}
    </View>
  );
}
