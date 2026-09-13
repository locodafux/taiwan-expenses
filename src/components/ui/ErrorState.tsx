import { Text, View } from 'react-native';

import { Button } from './Button';

export function ErrorState({
  message = "Couldn't load your data. Check your connection and try again.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-10">
      <Text className="text-center font-body text-sm text-status-bad">{message}</Text>
      <Button variant="secondary" size="sm" onPress={onRetry}>
        Retry
      </Button>
    </View>
  );
}
