import { Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon } from './Icon';

// A friendly tip on a butter note.
export function Callout({ children }: { children: string }) {
  const { vars } = useTheme();
  return (
    <View className="flex-row items-start gap-3 rounded-lg rounded-tl-sm bg-butter p-4">
      <Icon name="scissors" size={18} color={vars['--ink-2']} />
      <Text className="flex-1 font-body text-sm leading-[1.55] text-ink-2">{children}</Text>
    </View>
  );
}
