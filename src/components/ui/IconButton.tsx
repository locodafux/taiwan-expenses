import { Pressable, Text, type PressableProps } from 'react-native';

type IconButtonProps = Omit<PressableProps, 'children'> & {
  children: string;
  size?: number;
};

export function IconButton({ children, size = 32, disabled, className, ...props }: IconButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      style={{ width: size, height: size }}
      className={`items-center justify-center rounded-md border border-border bg-surface-2 ${
        disabled ? 'opacity-35' : ''
      } ${className ?? ''}`}
      {...props}
    >
      <Text className="text-ink text-base">{children}</Text>
    </Pressable>
  );
}
