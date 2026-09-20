import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockFrom = jest.fn();

const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
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

// Chainable + thenable read-query mock: .select().eq().eq().gte()/.order(),
// awaitable directly at any point in the chain like the real postgrest-js builder.
function buildSelectChain(result: { data: unknown; error: null }) {
  const chain: any = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    order: jest.fn(() => chain),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

const mockDelete = jest.fn();
const mockDeleteEq = jest.fn();

// Chainable delete mock: .delete({ count }).eq() resolving to { error, count }.
function buildDeleteChain(result: { error: null | { message: string }; count: number | null }) {
  mockDeleteEq.mockResolvedValue(result);
  mockDelete.mockReturnValue({ eq: mockDeleteEq });
  mockFrom.mockReturnValue({ delete: mockDelete });
}

import {
  useCheckLedgerEntry,
  useToggleMonthSkip,
  useCreateBillItem,
  useDeleteCategory,
  usePaydayStreak,
  useSavedThisQuarter,
  useSubmitBugReport,
  useUnreadMessageCount,
  useUpdateIncome,
} from '../queries';

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

  it('ticks the cached row instantly and rolls it back if the write fails', async () => {
    let rejectWrite!: (e: Error) => void;
    mockSingle.mockReturnValue(new Promise((_, reject) => (rejectWrite = reject)));
    mockSelect.mockReturnValue({ single: mockSingle });
    mockEq.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ['ledger-entries', 'household-1', '2026-10-05'];
    client.setQueryData(key, [
      { id: 'entry-1', status: 'pending' },
      { id: 'entry-2', status: 'pending' },
    ]);
    const { result } = await renderHook(() => useCheckLedgerEntry('household-1', '2026-10-05'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({ id: 'entry-1', checked: true });

    await waitFor(() =>
      expect(client.getQueryData(key)).toEqual([
        { id: 'entry-1', status: 'checked' },
        { id: 'entry-2', status: 'pending' },
      ]),
    );

    rejectWrite(new Error('offline'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(key)).toEqual([
      { id: 'entry-1', status: 'pending' },
      { id: 'entry-2', status: 'pending' },
    ]);
  });
});

describe('useUpdateIncome (edit/deactivate an existing income)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('soft-deactivates via the active flag rather than deleting the row', async () => {
    buildChain({ data: { id: 'income-1', active: false }, error: null });
    const { result } = await renderHook(() => useUpdateIncome('household-1'), { wrapper });

    result.current.mutate({ id: 'income-1', active: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('incomes');
    expect(mockUpdate).toHaveBeenCalledWith({ active: false });
    expect(mockEq).toHaveBeenCalledWith('id', 'income-1');
  });

  it('patches label/amount/recurring_day on edit', async () => {
    buildChain({ data: { id: 'income-1' }, error: null });
    const { result } = await renderHook(() => useUpdateIncome('household-1'), { wrapper });

    result.current.mutate({ id: 'income-1', label: '5th payday', amount: 30000, recurring_day: 5 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpdate).toHaveBeenCalledWith({ label: '5th payday', amount: 30000, recurring_day: 5 });
  });
});

describe('useSavedThisQuarter (dashboard momentum stat)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sums checked ledger amounts across all categories in the trailing window', async () => {
    const chain = buildSelectChain({
      data: [{ amount: 5000 }, { amount: 2500 }, { amount: 1250 }],
      error: null,
    });
    const { result } = await renderHook(() => useSavedThisQuarter('household-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(8750);
    expect(mockFrom).toHaveBeenCalledWith('ledger_entries');
    expect(chain.eq).toHaveBeenCalledWith('status', 'checked');
    expect(chain.gte).toHaveBeenCalledWith('payday_date', expect.any(String));
  });

  it('returns 0 when nothing has been checked in the window', async () => {
    buildSelectChain({ data: [], error: null });
    const { result } = await renderHook(() => useSavedThisQuarter('household-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(0);
  });
});

describe('usePaydayStreak (dashboard momentum chip)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts consecutive fully-checked past paydays, most recent first', async () => {
    buildSelectChain({
      data: [
        { payday_date: '2026-09-05', status: 'checked' },
        { payday_date: '2026-08-20', status: 'checked' },
        { payday_date: '2026-08-20', status: 'checked' },
        { payday_date: '2026-08-05', status: 'checked' },
      ],
      error: null,
    });
    const { result } = await renderHook(() => usePaydayStreak('household-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(3);
  });

  it('stops at the first payday with any unchecked entry', async () => {
    buildSelectChain({
      data: [
        { payday_date: '2026-09-05', status: 'checked' },
        { payday_date: '2026-08-20', status: 'pending' },
        { payday_date: '2026-08-05', status: 'checked' },
      ],
      error: null,
    });
    const { result } = await renderHook(() => usePaydayStreak('household-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(1);
  });

  it('ignores a materialized-but-not-yet-due future payday', async () => {
    buildSelectChain({
      data: [
        { payday_date: '2099-01-05', status: 'pending' },
        { payday_date: '2026-08-20', status: 'checked' },
      ],
      error: null,
    });
    const { result } = await renderHook(() => usePaydayStreak('household-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(1);
  });
});

describe('useDeleteCategory (regression: silent no-op delete)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the category row', async () => {
    buildDeleteChain({ error: null, count: 1 });
    const { result } = await renderHook(() => useDeleteCategory('household-1'), { wrapper });

    result.current.mutate('cat-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('categories');
    expect(mockDelete).toHaveBeenCalledWith({ count: 'exact' });
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'cat-1');
  });

  it('surfaces an error when the delete matches zero rows (e.g. RLS silently denies it)', async () => {
    buildDeleteChain({ error: null, count: 0 });
    const { result } = await renderHook(() => useDeleteCategory('household-1'), { wrapper });

    result.current.mutate('cat-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCreateBillItem (regression: checklist stale after adding a bill)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts under an explicit category_id and invalidates the household-wide bill list the checklist reads', async () => {
    const mockInsert = jest.fn(() => ({ select: mockSelect }));
    mockSelect.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: { id: 'bill-1', category_id: 'new-cat' }, error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCreateBillItem(undefined), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({ category_id: 'new-cat', label: 'Internet', amount: 1200, recurring_day: 5 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'new-cat', label: 'Internet', amount: 1200 }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bill-items', 'new-cat'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bill-items-household'] });
  });
});

describe('useSubmitBugReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts the report with household and device context, without reading it back', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
    const { result } = await renderHook(() => useSubmitBugReport('household-1'), { wrapper });

    result.current.mutate('Checklist froze');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('bug_reports');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: 'household-1',
        description: 'Checklist froze',
        platform: expect.any(String),
        os_version: expect.any(String),
        app_version: expect.any(String),
      }),
    );
  });

  it('surfaces an insert error', async () => {
    mockFrom.mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: { message: 'RLS denied' } }) });
    const { result } = await renderHook(() => useSubmitBugReport('household-1'), { wrapper });

    result.current.mutate('Checklist froze');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ message: 'RLS denied' });
  });
});


describe('useUnreadMessageCount (chat tab badge)', () => {
  // The count query is head-only: .select(id, { count, head }).eq().neq().gt()
  function buildCountChain(count: number) {
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      neq: jest.fn(() => chain),
      gt: jest.fn(() => chain),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ count, error: null }).then(resolve),
    };
    mockFrom.mockReturnValue(chain);
    return chain;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("counts only the partner messages newer than this device's last read", async () => {
    await AsyncStorage.setItem('chat:last-read:household-1', '2026-09-20T02:00:00.000Z');
    const chain = buildCountChain(2);

    const { result } = await renderHook(() => useUnreadMessageCount('household-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(2));

    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(chain.eq).toHaveBeenCalledWith('household_id', 'household-1');
    // Your own messages are never unread.
    expect(chain.neq).toHaveBeenCalledWith('sender_id', 'user-leo');
    expect(chain.gt).toHaveBeenCalledWith('created_at', '2026-09-20T02:00:00.000Z');
  });

  it('starts a device with no stored mark from now, not from the whole history', async () => {
    const chain = buildCountChain(0);

    const { result } = await renderHook(() => useUnreadMessageCount('household-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(0));

    const stored = await AsyncStorage.getItem('chat:last-read:household-1');
    expect(stored).toBeTruthy();
    expect(chain.gt).toHaveBeenCalledWith('created_at', stored);
  });
});

describe('useToggleMonthSkip (per-month fund skip)', () => {
  const mockInsert = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  it('records the skip against the first of the payday\'s month, then re-materializes', async () => {
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    const { result } = await renderHook(() => useToggleMonthSkip('household-1', '2027-01-20'), { wrapper });
    await result.current.mutateAsync({ categoryId: 'cat-savings', skipped: true });

    expect(mockFrom).toHaveBeenCalledWith('category_month_skips');
    expect(mockInsert).toHaveBeenCalledWith({
      household_id: 'household-1',
      category_id: 'cat-savings',
      month: '2027-01-01',
    });
    // The ledger rows only mirror the skip once materialize_payday reruns.
    expect(mockRpc).toHaveBeenCalledWith('materialize_payday', {
      p_household_id: 'household-1',
      p_payday_date: '2027-01-20',
    });
  });

  it('treats an un-skip that matched zero rows as an error, not a silent success', async () => {
    buildDeleteChain({ error: null, count: 0 });
    mockDeleteEq.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null, count: 0 }) });

    const { result } = await renderHook(() => useToggleMonthSkip('household-1', '2027-01-20'), { wrapper });

    await expect(
      result.current.mutateAsync({ categoryId: 'cat-savings', skipped: false }),
    ).rejects.toThrow('Could not un-skip this month');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
