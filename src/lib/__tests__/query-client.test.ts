const mockAddEventListener = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: (...args: any[]) => mockAddEventListener(...args) },
}));

import { onlineManager } from '@tanstack/react-query';

// Realtime's postgres_changes feed is never replayed after a dropped
// connection, so onlineManager must actually be wired to NetInfo (not just
// AppState, which only covers foreground/background) for reconnect refetches
// to fire - see AGENTS.md's query-client.tsx entry.
//
// query-client.tsx wires this as a module-load side effect, so it must be
// required lazily here (not as a static import, which Babel hoists above
// mockAddEventListener's declaration and breaks the mock).
describe('query-client online manager', () => {
  it('wires onlineManager to NetInfo connectivity changes', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../query-client');

    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
    const netInfoCallback = mockAddEventListener.mock.calls[0][0];

    netInfoCallback({ isConnected: false });
    expect(onlineManager.isOnline()).toBe(false);

    netInfoCallback({ isConnected: true });
    expect(onlineManager.isOnline()).toBe(true);
  });
});
