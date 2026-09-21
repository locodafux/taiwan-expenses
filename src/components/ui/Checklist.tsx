import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

import { CategoryMark } from './Card';
import { SectionLabel } from './Heading';
import { Icon } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChecklistRow({
  label,
  amount,
  color,
  checked,
  skipped,
  onToggle,
  onAmountPress,
  onLabelPress,
  onSkipToggle,
}: {
  label: string;
  amount: string;
  color: string;
  checked: boolean;
  // Skipped for this month (fund rows only) - shown, but not something to
  // tick off, so the checkbox and the amount edit are both inert.
  skipped?: boolean;
  onToggle: () => void;
  onAmountPress?: () => void;
  onLabelPress?: () => void;
  onSkipToggle?: () => void;
}) {
  const { vars } = useTheme();
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
        disabled={skipped}
        hitSlop={13}
        style={animatedStyle}
        className={`h-[22px] w-[22px] items-center justify-center rounded-[8px] border-2 ${
          checked ? 'border-status-good bg-status-good' : 'border-baseline bg-surface'
        } ${skipped ? 'opacity-40' : ''}`}
      >
        {checked && (
          <Animated.View entering={ZoomIn.duration(120)}>
            <Icon name="check" size={14} strokeWidth={2.6} color="#ffffff" />
          </Animated.View>
        )}
      </AnimatedPressable>
      <CategoryMark color={color} size={8} />
      <Pressable className="flex-1" onPress={onToggle} disabled={skipped}>
        <Text
          className={`font-body text-base ${
            skipped || checked ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {label}
        </Text>
      </Pressable>
      {skipped ? (
        <Text className="rounded-pill bg-surface-2 px-3 py-[2px] font-body-semibold text-xs text-ink-muted">
          Skipped
        </Text>
      ) : (
        <Pressable onPress={onAmountPress} disabled={!onAmountPress}>
          <Text className={`font-mono text-sm ${checked ? 'text-ink-muted' : 'text-ink'}`}>{amount}</Text>
        </Pressable>
      )}
      {onSkipToggle && (
        <Pressable onPress={onSkipToggle} hitSlop={8}>
          <Text className="font-body-semibold text-xs text-accent">{skipped ? 'Unskip' : 'Skip'}</Text>
        </Pressable>
      )}
      {onLabelPress && (
        <Pressable onPress={onLabelPress} hitSlop={8}>
          <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />
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
      <SectionLabel className="mb-0 mt-1">{heading}</SectionLabel>
      {note && <Text className="mb-1 font-body text-xs text-ink-muted">{note}</Text>}
      {children}
    </View>
  );
}
