import { Text, View } from 'react-native';

export function Avatar({
  initial,
  color,
  size = 28,
  style,
}: {
  initial: string;
  color: string;
  size?: number;
  style?: object;
}) {
  return (
    <View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
      className="items-center justify-center"
    >
      <Text className="font-body-bold text-white" style={{ fontSize: size * 0.42 }}>
        {initial}
      </Text>
    </View>
  );
}
