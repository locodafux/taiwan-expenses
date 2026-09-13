import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { GRADIENT_ACCENT } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

type ButtonProps = Omit<PressableProps, 'children'> & {
  children: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-6 py-3',
  md: 'px-7 py-5',
};

const textSizeClasses: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
};

const variantClasses: Record<Variant, { container: string; text: string }> = {
  primary: { container: 'bg-accent', text: 'text-white' },
  secondary: { container: 'bg-surface-2 border border-border', text: 'text-ink' },
  ghost: { container: 'bg-transparent', text: 'text-ink-2' },
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  ...pressableProps
}: ButtonProps) {
  const { theme } = useTheme();
  const gradient = variant === 'primary' ? GRADIENT_ACCENT[theme] : null;
  const isDisabled = disabled || loading;
  const v = variantClasses[variant];

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff9f4' : undefined} />
      ) : (
        <Text className={`font-body-semibold ${textSizeClasses[size]} ${v.text} text-center`}>
          {children}
        </Text>
      )}
    </>
  );

  if (gradient) {
    return (
      <Pressable
        disabled={isDisabled}
        className={`rounded-md overflow-hidden ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
        {...pressableProps}
      >
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text
            className={`font-body-semibold ${textSizeClasses[size]} text-white text-center ${sizeClasses[size]}`}
          >
            {loading ? '…' : children}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      disabled={isDisabled}
      className={`rounded-md items-center justify-center ${sizeClasses[size]} ${v.container} ${
        isDisabled ? 'opacity-50' : ''
      } ${className ?? ''}`}
      {...pressableProps}
    >
      {content}
    </Pressable>
  );
}
