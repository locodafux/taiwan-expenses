import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon } from './Icon';

// The app's "this is done" mark (payday sorted, goal met): a sage leaf with a
// check, in place of a party emoji.
export function DoneBadge() {
  const { vars } = useTheme();
  return (
    <View className="h-14 w-14 items-center justify-center rounded-lg rounded-bl-sm bg-sage-soft">
      <Icon name="check" size={28} strokeWidth={2.6} color={vars['--accent-2']} />
    </View>
  );
}
