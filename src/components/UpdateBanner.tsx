import { useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { checkForUpdate, downloadAndInstall, type AvailableUpdate } from '@/lib/appUpdate';

// Mounted once above the tab navigator so it checks at most once per app
// session regardless of which screen is active - see appUpdate.ts for why
// "newer" is decided by upload vs. install time rather than a version tag.
export function UpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    checkForUpdate()
      .then(setUpdate)
      .catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  const handleDownload = async () => {
    setError(false);
    setProgress(0);
    try {
      await downloadAndInstall(update, setProgress);
      setDismissed(true);
    } catch {
      setError(true);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={() => setDismissed(true)}>
      <SafeAreaView edges={['top']} pointerEvents="box-none" className="flex-1">
        <Card className="mx-7 mt-3 gap-3 p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="font-body-bold text-sm text-ink">A new version is available</Text>
              <Text className="mt-1 font-body text-xs text-ink-muted">
                {error
                  ? "Couldn't complete the download or install. Try again."
                  : 'Download it to update the app.'}
              </Text>
            </View>
            <Text className="text-ink-muted" onPress={() => setDismissed(true)}>
              ✕
            </Text>
          </View>
          <Button size="sm" onPress={handleDownload} loading={progress !== null}>
            Download
          </Button>
          {progress !== null && progress > 0 && (
            <Text className="text-center font-body text-xs text-ink-muted">
              Downloading… {Math.round(progress * 100)}%
            </Text>
          )}
        </Card>
      </SafeAreaView>
    </Modal>
  );
}
