import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function useCategoryColors() {
  const { vars } = useTheme();
  return [
    { value: vars['--cat-expenses'], name: 'Blue' },
    { value: vars['--cat-debt'], name: 'Rust' },
    { value: vars['--cat-taiwan'], name: 'Teal' },
    { value: vars['--cat-emergency'], name: 'Gold' },
    { value: vars['--cat-savings'], name: 'Pink' },
    { value: vars['--cat-pinatubo'], name: 'Green' },
    { value: vars['--cat-excess'], name: 'Brown' },
  ];
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const { vars } = useTheme();
  const options = useCategoryColors();
  return (
    <View className="flex-row flex-wrap gap-3">
      {options.map((c) => (
        <Pressable
          key={c.value}
          onPress={() => onChange(c.value)}
          accessibilityLabel={c.name}
          accessibilityRole="button"
          className="h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: c.value,
            borderWidth: value === c.value ? 3 : 0,
            borderColor: vars['--ink'],
          }}
        />
      ))}
    </View>
  );
}
