import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FullNumbersTable } from '@/components/FullNumbersTable';

// Yearly Cashflow on its own screen so only it turns sideways: landscape while focused, back to portrait on leaving
// (the rest of the app stays upright - app.json's orientation is portrait).
export default function CashflowScreen() {
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, []),
  );

  return (
    <SafeAreaView className="flex-1 bg-page px-3 pt-2">
      <FullNumbersTable />
    </SafeAreaView>
  );
}
