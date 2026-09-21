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
    <View className="flex-row gap-1 rounded-pill bg-surface-2 p-1">
      {THEME_NAMES.map((key) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            className={`flex-1 items-center rounded-pill px-3 py-3 ${active ? 'bg-surface' : ''}`}
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
