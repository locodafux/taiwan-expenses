import { Text, View } from 'react-native';

// Screen title: a small friendly line over a soft serif title.
export function ScreenHeader({
  kicker,
  title,
  subtitle,
  right,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-end justify-between gap-3">
      <View className="flex-1">
        {kicker && <Text className="mb-1 font-body-medium text-sm text-ink-muted">{kicker}</Text>}
        <Text className="font-display text-xl text-ink" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && <Text className="mt-1 font-body text-sm text-ink-2">{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

// Section heading in the serif, with an optional trailing action.
export function SectionLabel({
  children,
  right,
  className,
}: {
  children: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`mb-2 flex-row items-center justify-between gap-3 ${className ?? ''}`}>
      <Text className="font-display text-md text-ink">{children}</Text>
      {right}
    </View>
  );
}
