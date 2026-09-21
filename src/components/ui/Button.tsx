import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
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

// Primary is the soft brown ink, not a loud accent: in Sunday Market colour
// is for categories and good news, actions stay calm.
const variantClasses: Record<Variant, { container: string; text: string }> = {
  primary: { container: 'bg-ink', text: 'text-page' },
  secondary: { container: 'bg-surface-2', text: 'text-ink' },
  ghost: { container: 'bg-transparent', text: 'text-ink-2' },
  danger: { container: 'bg-status-bad', text: 'text-white' },
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
  const { vars } = useTheme();
  const isDisabled = disabled || loading;
  const v = variantClasses[variant];
  const indicatorColor =
    variant === 'primary' ? vars['--page'] : variant === 'danger' ? '#fff9f4' : vars['--ink'];

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={indicatorColor} />
      ) : (
        <Text className={`font-body-bold ${textSizeClasses[size]} ${v.text} text-center`}>
          {children}
        </Text>
      )}
    </>
  );

  return (
    <Pressable
      disabled={isDisabled}
      className={`rounded-md items-center justify-center active:opacity-80 ${sizeClasses[size]} ${v.container} ${
        isDisabled ? 'opacity-50' : ''
      } ${className ?? ''}`}
      {...pressableProps}
    >
      {content}
    </Pressable>
  );
}
