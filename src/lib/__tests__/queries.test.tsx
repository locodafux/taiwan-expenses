import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

jest.mock('../auth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-leo' } } }),
}));

// Chainable query builder mock: .update().eq().select().single()
function buildChain(result: { data: unknown; error: null }) {
  mockSingle.mockResolvedValue(result);
  mockSelect.mockReturnValue({ single: mockSingle });
  mockEq.mockReturnValue({ select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
}

import { useCheckLedgerEntry } from '../queries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCheckLedgerEntry (checklist check-off -> ledger post)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts a checked ledger transaction with the current user and a timestamp', async () => {
    buildChain({ data: { id: 'entry-1', status: 'checked' }, error: null });
    const { result } = await renderHook(() => useCheckLedgerEntry('household-1', '2026-10-05'), { wrapper });

    result.current.mutate({ id: 'entry-1', checked: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('ledger_entries');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'checked', checked_by: 'user-leo' }),
    );
    const [[patch]] = mockUpdate.mock.calls;
    expect(typeof patch.checked_at).toBe('string');
    expect(mockEq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('reverts an unchecked entry to pending with no checker', async () => {
    buildChain({ data: { id: 'entry-1', status: 'pending' }, error: null });
    const { result } = await renderHook(() => useCheckLedgerEntry('household-1', '2026-10-05'), { wrapper });

    result.current.mutate({ id: 'entry-1', checked: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'pending', checked_by: null, checked_at: null });
  });
});
