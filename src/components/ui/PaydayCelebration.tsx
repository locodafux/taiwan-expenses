import { Text } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Card } from './Card';

// Shown once every item on the current payday is checked - celebratory
// framing on purpose (never a warning/red state), per the design-research
// report's finding that "celebrate outcomes" + celebratory-over-shame
// copy drives retention for recurring-task apps like this one.
export function PaydayCelebration({ streak }: { streak: number }) {
  return (
    <Animated.View entering={ZoomIn.duration(220)}>
      <Card className="items-center gap-2 border-accent bg-accent-soft px-6 py-7">
        <Text className="text-2xl">🎉</Text>
        <Text className="font-display-semibold text-lg text-ink">Payday sorted</Text>
        <Text className="text-center font-body text-sm text-ink-2">
          Every item&apos;s checked off for this payday.
        </Text>
        <Text className="mt-1 font-body-semibold text-sm text-accent">
          {streak > 1 ? `🔥 ${streak} paydays in a row` : 'First payday fully checked off'}
        </Text>
      </Card>
    </Animated.View>
  );
}
