import { Pressable, View, type ViewProps } from 'react-native';

// Flat bordered cards read as dated/2D on Android, where shadowOpacity alone
// (no elevation) renders no shadow at all - both are required for the same
// "floating surface" depth cue on both platforms.
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 3,
};

// The bordered-surface-with-divided-rows pattern repeated across every
// screen in the design system's ui_kits (category/income/history/member
// lists) - one shared primitive instead of re-deriving borders per screen.
export function Card({ children, className, style, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-lg border border-border bg-surface ${className ?? ''}`}
      style={[CARD_SHADOW, style]}
      {...props}
    >
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
  return <Pressable onPress={onPress}>{content}</Pressable>;
}
