import { Text, View } from 'react-native';

// Empty sections get a warm butter note rather than a blank gap.
export function EmptyState({ children, className }: { children: string; className?: string }) {
  return (
    <View className={`items-center rounded-lg rounded-bl-sm bg-butter px-5 py-5 ${className ?? ''}`}>
      <Text className="text-center font-body text-sm text-ink-2">{children}</Text>
    </View>
  );
}
