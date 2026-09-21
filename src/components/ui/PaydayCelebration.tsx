import { Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

import { Card } from './Card';
import { Icon } from './Icon';
import { DoneBadge } from './DoneBadge';

// Shown once every item on the current payday is checked - celebratory
// framing on purpose (never a warning/red state), per the design-research
// report's finding that "celebrate outcomes" + celebratory-over-shame
// copy drives retention for recurring-task apps like this one.
export function PaydayCelebration({ streak }: { streak: number }) {
  const { vars } = useTheme();
  return (
    <Animated.View entering={ZoomIn.duration(220)}>
      <Card className="items-center gap-2 rounded-bl-sm px-6 py-5">
        <DoneBadge />
        <Text className="mt-1 font-display text-lg text-ink">Payday sorted</Text>
        <Text className="text-center font-body text-sm text-ink-2">
          Every item&apos;s checked off for this payday.
        </Text>
        <View className="mt-1 flex-row items-center gap-1">
          {streak > 1 && <Icon name="flame" size={16} color={vars['--accent-2']} />}
          <Text className="font-body-semibold text-sm text-accent-2">
            {streak > 1 ? `${streak} paydays in a row` : 'First payday fully checked off'}
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}
