import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, QueryClientProvider as TanstackProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

// Mirrors TanStack's official RN guide: NetInfo is the only way to detect a
// dropped connection without backgrounding (AppState alone misses that case -
// see the focusManager wiring below, which only covers foreground/background).
if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
  );
}

// Realtime (src/lib/realtime.ts) invalidates these queries on change;
// staleTime/refetchOnWindowFocus remain as a fallback for when a client
// reconnects or the channel hasn't delivered an event yet. Postgres_changes
// events missed while disconnected are never replayed, so this fallback is
// the only thing that resyncs a household member's stale cache after a
// backgrounded app resumes - without it (RN doesn't emit the window focus
// events refetchOnWindowFocus relies on) the UI can go stale indefinitely.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  return <TanstackProvider client={queryClient}>{children}</TanstackProvider>;
}
