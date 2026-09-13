import { Pressable, Text, View } from 'react-native';

import { THEME_NAMES, type ThemeName } from '@/theme/tokens';

const LABELS: Record<ThemeName, string> = {
  original: 'Original',
  warm: 'Warm',
  playful: 'Playful',
};

export function ThemeSwitcher({
  value,
  onChange,
}: {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
}) {
  return (
    <View className="flex-row gap-1 rounded-md border border-border bg-surface-2 p-1">
      {THEME_NAMES.map((key) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            className={`flex-1 items-center rounded-sm px-3 py-3 ${active ? 'bg-surface' : ''}`}
            style={active ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2 } : undefined}
          >
            <Text className={`font-body-semibold text-sm ${active ? 'text-ink' : 'text-ink-2'}`}>
              {LABELS[key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
