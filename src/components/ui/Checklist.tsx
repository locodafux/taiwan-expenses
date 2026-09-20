import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChecklistRow({
  label,
  amount,
  color,
  checked,
  onToggle,
  onAmountPress,
  onLabelPress,
}: {
  label: string;
  amount: string;
  color: string;
  checked: boolean;
  onToggle: () => void;
  onAmountPress?: () => void;
  onLabelPress?: () => void;
}) {
  const isFirstRender = useRef(true);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    scale.value = withSequence(withTiming(1.2, { duration: 90 }), withTiming(1, { duration: 120 }));
  }, [checked, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View className="flex-row items-center gap-3 border-b border-gridline py-3">
      <AnimatedPressable
        onPress={onToggle}
        hitSlop={13}
        style={animatedStyle}
        className={`h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${
          checked ? 'border-status-good bg-status-good' : 'border-border'
        }`}
      >
        {checked && (
          <Animated.Text entering={ZoomIn.duration(120)} className="text-xs text-white">
            ✓
          </Animated.Text>
        )}
      </AnimatedPressable>
      <View className="h-[9px] w-[9px] rounded-[3px]" style={{ backgroundColor: color }} />
      <Pressable className="flex-1" onPress={onToggle}>
        <Text
          className={`font-body text-base ${checked ? 'text-ink-muted line-through' : 'text-ink'}`}
        >
          {label}
        </Text>
      </Pressable>
      <Pressable onPress={onAmountPress} disabled={!onAmountPress}>
        <Text className="font-mono text-sm text-ink-2">{amount}</Text>
      </Pressable>
      {onLabelPress && (
        <Pressable onPress={onLabelPress} hitSlop={8}>
          <Text className="text-ink-muted">›</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ChecklistGroup({
  heading,
  note,
  children,
}: {
  heading: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-5">
      <Text className="font-body-bold text-sm text-ink">{heading}</Text>
      {note && <Text className="mb-2 mt-[2px] font-body text-xs text-ink-muted">{note}</Text>}
      {children}
    </View>
  );
}
