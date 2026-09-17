import { useEffect, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatPeso } from '@/lib/format';

import { Button } from './Button';

const SHEET_OFFSET = Dimensions.get('window').height;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center rounded-sm bg-surface-2 px-2 py-3">
      <Text className="font-display-semibold text-md text-ink">{value}</Text>
      <Text className="mt-1 font-body text-xs uppercase text-ink-muted">{label}</Text>
    </View>
  );
}

// Option 2 from the design review (bottom sheet + impact stats) - a themed
// replacement for Alert.alert() that shows the real stakes (bill/entry
// counts, total logged) instead of burying them in a sentence.
export function DeleteCategorySheet({
  visible,
  categoryName,
  categoryColor,
  showBillCount,
  billCount,
  entryCount,
  totalLogged,
  deleting,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  categoryName: string;
  categoryColor: string | null;
  showBillCount: boolean;
  billCount: number;
  entryCount: number;
  totalLogged: number;
  deleting: boolean;
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
  }, [visible, translateY]);

  const hasHistory = entryCount > 0 || billCount > 0;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <SafeAreaView edges={['bottom']} className="flex-1 justify-end bg-black/30">
        <Pressable className="absolute inset-0" onPress={onCancel} />
        <Animated.View
          style={{ transform: [{ translateY }] }}
          className="rounded-t-xl border border-border bg-surface px-7 pb-6 pt-4"
        >
          <View className="mb-4 h-1 w-9 self-center rounded-full bg-baseline" />

          <View className="mb-5 flex-row items-center gap-3">
            <View
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: categoryColor ?? '#999' }}
            />
            <Text className="font-body-semibold text-md text-ink">{categoryName}</Text>
          </View>

          {hasHistory ? (
            <View className="mb-6 flex-row gap-2">
              {showBillCount && <Stat value={String(billCount)} label="Bills" />}
              <Stat value={String(entryCount)} label="Entries" />
              <Stat value={formatPeso(totalLogged)} label="Logged" />
            </View>
          ) : (
            <Text className="mb-6 font-body text-sm text-ink-muted">
              No bills or history logged yet — there&apos;s nothing else to lose.
            </Text>
          )}

          <Button
            variant="danger"
            loading={deleting}
            onPress={onConfirm}
            className="mb-3 w-full"
          >
            Delete Category & History
          </Button>
          <Button variant="ghost" size="sm" disabled={deleting} onPress={onCancel} className="w-full">
            Cancel
          </Button>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}
