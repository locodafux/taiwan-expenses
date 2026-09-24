import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { CHANGELOG, unseenEntries, type ChangelogEntry } from '@/lib/changelog';

const SEEN_KEY = 'taiwan-fund-planner:whats-new-seen';
const WINDOW_HEIGHT = Dimensions.get('window').height;

export function ChangeList({ items, small }: { items: string[]; small?: boolean }) {
  return (
    <View className={small ? 'gap-2' : 'gap-4'}>
      {items.map((item) => (
        <View key={item} className="flex-row gap-3">
          <View className="mt-2 h-2 w-2 rounded-pill bg-accent" />
          <Text className={`flex-1 font-body leading-[1.55] text-ink-2 ${small ? 'text-xs' : 'text-sm'}`}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Same plain-Modal bottom sheet as DeleteCategorySheet.
export function WhatsNewSheet({
  entries,
  visible,
  onClose,
}: {
  entries: ChangelogEntry[];
  visible: boolean;
  onClose: () => void;
}) {
  const [translateY] = useState(() => new Animated.Value(WINDOW_HEIGHT));

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : WINDOW_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <SafeAreaView edges={['bottom']} className="flex-1 justify-end bg-black/30">
        <Pressable className="absolute inset-0" onPress={onClose} />
        {/* className on an inner View: Animated.View drops it on web. */}
        <Animated.View style={{ transform: [{ translateY }] }}>
          <View className="rounded-t-xl bg-surface px-7 pb-6 pt-4">
            <View className="mb-4 h-1 w-9 self-center rounded-pill bg-baseline" />
            <Text className="mb-4 font-display text-lg text-ink">What’s new</Text>
            <ScrollView style={{ maxHeight: WINDOW_HEIGHT * 0.6 }} contentContainerClassName="gap-9 pb-2">
              {entries.map((entry) => (
                <View key={entry.id} className="gap-4">
                  <Text className="font-body-semibold text-xs text-ink-muted">{entry.date}</Text>
                  <ChangeList items={entry.items} />
                </View>
              ))}
            </ScrollView>
            <Button onPress={onClose} className="mt-7 w-full">
              Got it
            </Button>
          </View>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

// Mounted once above the tab navigator: after an update, shows the entries
// this phone hasn't seen once, then remembers the newest as seen. Keyed on
// changelog ids because the app's version string never changes between builds.
export function WhatsNew() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => setEntries(unseenEntries(CHANGELOG, seen)))
      .catch(() => {});
  }, []);

  function close() {
    setDismissed(true);
    AsyncStorage.setItem(SEEN_KEY, CHANGELOG[0].id).catch(() => {});
  }

  return <WhatsNewSheet entries={entries} visible={entries.length > 0 && !dismissed} onClose={close} />;
}
