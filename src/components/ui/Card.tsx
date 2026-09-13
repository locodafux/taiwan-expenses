import { Pressable, View, type ViewProps } from 'react-native';

// The bordered-surface-with-divided-rows pattern repeated across every
// screen in the design system's ui_kits (category/income/history/member
// lists) - one shared primitive instead of re-deriving borders per screen.
export function Card({ children, className, ...props }: ViewProps & { className?: string }) {
  return (
    <View className={`rounded-lg border border-border bg-surface ${className ?? ''}`} {...props}>
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
      className={`flex-row items-center gap-3 px-5 py-4 ${isLast ? '' : 'border-b border-gridline'} ${
        className ?? ''
      }`}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}
