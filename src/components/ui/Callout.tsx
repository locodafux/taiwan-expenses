import { Text, View } from 'react-native';

export function Callout({ children, icon = '✂️' }: { children: string; icon?: string }) {
  return (
    <View className="flex-row items-start gap-3 rounded-md border border-border bg-accent-soft p-4">
      <Text>{icon}</Text>
      <Text className="flex-1 font-body text-sm leading-[1.55] text-ink-2">{children}</Text>
    </View>
  );
}
