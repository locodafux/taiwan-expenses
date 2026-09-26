import { useEffect, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from './Button';

const SHEET_OFFSET = Dimensions.get('window').height;

// A themed replacement for destructive Alert.alert() confirmations. Keeping
// the title, message, and action labels as props lets each flow retain its
// exact wording while sharing the same interaction pattern.
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [translateY] = useState(() => new Animated.Value(SHEET_OFFSET));

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : SHEET_OFFSET,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  const cancel = () => {
    if (!loading) onCancel();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={cancel}>
      <SafeAreaView edges={['bottom']} className="flex-1 justify-end bg-black/30">
        <Pressable className="absolute inset-0" onPress={cancel} />
        <Animated.View
          style={{ transform: [{ translateY }] }}
          className="rounded-t-xl bg-surface px-7 pb-6 pt-4"
        >
          <View className="mb-5 h-1 w-9 self-center rounded-pill bg-baseline" />
          <Text className="font-display-semibold text-lg text-ink">{title}</Text>
          <Text className="mb-6 mt-2 font-body text-sm leading-[1.5] text-ink-muted">{message}</Text>

          <Button
            variant="danger"
            loading={loading}
            onPress={onConfirm}
            className="mb-3 w-full"
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" size="sm" disabled={loading} onPress={cancel} className="w-full">
            {cancelLabel}
          </Button>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}
