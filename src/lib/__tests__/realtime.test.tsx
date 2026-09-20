import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockOn = jest.fn();
const mockSubscribe = jest.fn();
const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();
const callbacks: Record<string, () => void> = {};

jest.mock('../supabase', () => ({
  supabase: {
    channel: (...args: any[]) => mockChannel(...args),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
  },
}));

import { useRealtimeSync } from '../realtime';

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// Each table subscribed here is a real household-scoped table a second
// member's changes land in; missing one leaves a household member's already-open
// screen stale until they manually refresh (found while testing concurrent
// two-member use - household_members was missing before this fix).
describe('useRealtimeSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(callbacks)) delete callbacks[key];
    mockOn.mockImplementation((_event, config: { table: string }, callback: () => void) => {
      callbacks[config.table] = callback;
      return { on: mockOn, subscribe: mockSubscribe };
    });
    mockSubscribe.mockReturnValue('channel-instance');
    mockChannel.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
  });

  it('subscribes to every household-scoped table, including household_members', async () => {
    await renderHook(() => useRealtimeSync('household-1'), { wrapper: wrapper(new QueryClient()) });

    expect(Object.keys(callbacks)).toEqual(
      expect.arrayContaining([
        'household_members',
        'categories',
        'incomes',
        'bill_items',
        'ledger_entries',
        'messages',
      ]),
    );
  });

  it('invalidates the chat queries when a message arrives', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useRealtimeSync('household-1'), { wrapper: wrapper(queryClient) });

    callbacks.messages();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'household-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages-unread', 'household-1'] });
  });

  it('invalidates the household-members query when household_members changes', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useRealtimeSync('household-1'), { wrapper: wrapper(queryClient) });

    callbacks.household_members();

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['household-members', 'household-1'] });
  });
});
