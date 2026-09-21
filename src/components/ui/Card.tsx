import { Pressable, Text, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

// A soft cream panel: no outline, no drop shadow - it sits on the page by
// tone alone. The shared surface for every grouped list/form on every screen.
export function Card({ children, className, ...props }: ViewProps & { className?: string }) {
  return (
    <View className={`rounded-lg bg-surface ${className ?? ''}`} {...props}>
      {children}
    </View>
  );
}

export function ListRow({
  children,
  isLast,
  onPress,
  className,
}: {
  children: React.ReactNode;
  isLast?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  const content = (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${isLast ? '' : 'border-b border-gridline'} ${
        className ?? ''
      }`}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} className="active:opacity-60">
      {content}
    </Pressable>
  );
}

// A category's marker. With a label: a rounded tile tinted in the category's
// colour carrying its initial. Without: a small dot for tight rows.
export function CategoryMark({
  color,
  size = 10,
  label,
}: {
  color: string | null | undefined;
  size?: number;
  label?: string;
}) {
  const { vars } = useTheme();
  const c = color ?? vars['--ink-muted'];
  if (!label) {
    return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />;
  }
  // 18% tint of a #rrggbb colour; anything else falls back to the neutral tile.
  const tint = /^#[0-9a-f]{6}$/i.test(c) ? `${c}2e` : vars['--surface-2'];
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: tint }}
      className="items-center justify-center"
    >
      <Text style={{ color: c, fontSize: size * 0.45 }} className="font-body-bold">
        {label.trim()[0]?.toUpperCase() ?? ''}
      </Text>
    </View>
  );
}
