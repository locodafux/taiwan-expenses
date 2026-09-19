import { TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

// RN's default placeholder grey is barely readable on the themes' cream/lilac
// page backgrounds. ink-2 clears WCAG AA contrast in all three themes while
// still reading lighter than typed (ink) text. Use this instead of a bare
// TextInput so every field gets it.
export function TextField(props: TextInputProps & { className?: string }) {
  const { vars } = useTheme();
  return <TextInput placeholderTextColor={vars['--ink-2']} {...props} />;
}
