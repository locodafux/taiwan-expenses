import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { nextPayday, toDateOnly } from '@/lib/payday';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/theme/ThemeProvider';

const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseIncomes = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryMonthPercents = jest.fn();
const mockUseLedgerEntriesForPayday = jest.fn();
const mockUseMaterializePayday = jest.fn();
const mockUseCheckLedgerEntry = jest.fn();
const mockUseUpdateLedgerAmount = jest.fn();
const mockUsePaydayCompletionHistory = jest.fn();
const mockUseGoalShortfalls = jest.fn();
const mockUsePaydayCarries = jest.fn();
const mockUsePaydayPreview = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  useHouseholdBillItems: (...args: unknown[]) => mockUseHouseholdBillItems(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryMonthPercents: (...args: unknown[]) => mockUseCategoryMonthPercents(...args),
  useLedgerEntriesForPayday: (...args: unknown[]) => mockUseLedgerEntriesForPayday(...args),
  useMaterializePayday: (...args: unknown[]) => mockUseMaterializePayday(...args),
  useCheckLedgerEntry: (...args: unknown[]) => mockUseCheckLedgerEntry(...args),
  useUpdateLedgerAmount: (...args: unknown[]) => mockUseUpdateLedgerAmount(...args),
  usePaydayCompletionHistory: (...args: unknown[]) => mockUsePaydayCompletionHistory(...args),
  useGoalShortfalls: (...args: unknown[]) => mockUseGoalShortfalls(...args),
  usePaydayCarries: (...args: unknown[]) => mockUsePaydayCarries(...args),
  usePaydayPreview: (...args: unknown[]) => mockUsePaydayPreview(...args),
}));

import PaydayChecklist from '../checklist';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const incomes = [{ id: 'inc-1', active: true, recurring_day: 5, amount: 30000 }];

const entries = [
  {
    id: 'entry-1',
    category_id: 'cat-bill',
    amount: 1500,
    status: 'pending',
    categories: { name: 'Rent', color: '#c1552f', kind: 'bill', start_month: '2026-10-01', end_month: null, },
    bill_items: { label: 'Rent' },
  },
  {
    id: 'entry-2',
    category_id: 'cat-fund',
    amount: 2000,
    status: 'checked',
    categories: { name: 'Taiwan fund', color: '#1f5c56', kind: 'fund', start_month: '2026-10-01', end_month: null, },
    bill_items: null,
  },
];

function okQuery<T>(data: T) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

const mockCheckMutate = jest.fn();
const mockMaterializeMutate = jest.fn();
const mockUpdateAmountMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({});
  mockUseHouseholdMembership.mockReturnValue(okQuery(member));
  mockUseIncomes.mockReturnValue(okQuery(incomes));
  mockUseHouseholdBillItems.mockReturnValue(okQuery([]));
  mockUseCategories.mockReturnValue(okQuery([]));
  mockUseCategoryMonthPercents.mockReturnValue(okQuery([]));
  mockUseLedgerEntriesForPayday.mockReturnValue(okQuery(entries));
  mockUseMaterializePayday.mockReturnValue({ mutate: mockMaterializeMutate });
  mockUseCheckLedgerEntry.mockReturnValue({ mutate: mockCheckMutate });
  mockUseUpdateLedgerAmount.mockReturnValue({
    mutateAsync: mockUpdateAmountMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUsePaydayCompletionHistory.mockReturnValue(okQuery([]));
  mockUseGoalShortfalls.mockReturnValue(okQuery([]));
  mockUsePaydayCarries.mockReturnValue(okQuery([]));
  mockUsePaydayPreview.mockReturnValue(okQuery(undefined));
});

describe('PaydayChecklist', () => {
  it('renders the checklist grouped into money leaving / money staying with realistic entries', async () => {
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Rent')).toBeTruthy());
    expect(getByText('Taiwan fund')).toBeTruthy();
    expect(getByText('Money leaving')).toBeTruthy();
    expect(getByText('Money staying')).toBeTruthy();
    expect(getByText('1 / 2 items checked')).toBeTruthy();
  });

  it('shows what a fund carried over, and keeps a carried-away row out of the count', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([
        { ...entries[1], status: 'pending', amount: 3000, carried_amount: 1000, carried_from: '2026-10-05' },
        { ...entries[1], id: 'entry-3', status: 'carried', amount: 700, categories: { ...entries[1].categories, name: 'Trip fund' } },
      ]),
    );
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText(/^\+₱.1,000 carried from .*5/)).toBeTruthy());
    expect(getByText('Carried to the next payday')).toBeTruthy();
    expect(getByText('0 / 1 items checked')).toBeTruthy();
  });

  it('shows what a bill carried over, and keeps a carried-away bill out of the count', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([
        { ...entries[0], status: 'pending', amount: 3000, carried_amount: 1000, carried_from: '2026-10-05' },
        { ...entries[0], id: 'entry-3', status: 'carried', amount: 700, bill_items: { label: 'Internet' } },
      ]),
    );
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText(/^\+₱.1,000 carried from .*5/)).toBeTruthy());
    expect(getByText('Carried to the next payday')).toBeTruthy();
    expect(getByText('0 / 1 items checked')).toBeTruthy();
  });

  it('warns when a goal cannot be fully funded before its deadline', async () => {
    mockUseCategories.mockReturnValue(okQuery([{ id: 'cat-trip', name: 'Japan trip', kind: 'fund', start_month: '2026-10-01', end_month: null, }]));
    mockUseGoalShortfalls.mockReturnValue(okQuery([{ category_id: 'cat-trip', shortfall: 5000 }]));
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText(/Japan trip will be ₱ 5,000 short by its deadline/)).toBeTruthy());
  });

  it('says what this payday keeps for a short one, and what covers its own bills', async () => {
    const payday = toDateOnly(nextPayday([5]));
    const month = payday.slice(0, 8);
    mockUsePaydayCarries.mockReturnValue(
      okQuery([
        { from_payday: payday, to_payday: `${month}15`, amount: 1700 },
        { from_payday: `${month}04`, to_payday: payday, amount: 300 },
        { from_payday: `${month}20`, to_payday: `${month}30`, amount: 999 },
      ]),
    );
    const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText(/Keep ₱ 1,700 of this pay aside for the 15th/)).toBeTruthy());
    expect(getByText(/₱ 300 of these bills is paid from what you kept aside on the 4th/)).toBeTruthy();
    expect(queryByText(/999/)).toBeNull();
  });

  it('checks off an item, posting a checked mutation for that entry', async () => {
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await fireEvent.press(await waitFor(() => getByText('Rent')));

    expect(mockCheckMutate).toHaveBeenCalledWith({ id: 'entry-1', checked: true });
  });

  it('unchecks an already-checked item', async () => {
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await fireEvent.press(await waitFor(() => getByText('Taiwan fund')));

    expect(mockCheckMutate).toHaveBeenCalledWith({ id: 'entry-2', checked: false });
  });

  it('moves checked items below unchecked ones', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([
        { ...entries[0], id: 'entry-paid', status: 'checked', bill_items: { label: 'Internet' } },
        entries[0],
      ]),
    );
    const { getAllByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() =>
      expect(getAllByText(/^(Rent|Internet)$/).map((n) => n.props.children)).toEqual(['Rent', 'Internet']),
    );
  });

  it('shows an error state with retry when a query fails', async () => {
    const refetch = jest.fn();
    mockUseLedgerEntriesForPayday.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    const retry = await waitFor(() => getByText('Retry'));
    await fireEvent.press(retry);
    expect(refetch).toHaveBeenCalled();
  });

  it('prompts to add an income when there are no active incomes to derive a payday from', async () => {
    mockUseIncomes.mockReturnValue(okQuery([]));
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Add an income first to see your payday checklist.')).toBeTruthy());
  });

  it('shows an empty state when the payday has no items yet', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(okQuery([]));
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Nothing to check off for this payday yet.')).toBeTruthy());
  });

  it('does not show the celebration card while items are still unchecked', async () => {
    const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Rent')).toBeTruthy());
    expect(queryByText('Payday sorted')).toBeNull();
  });

  it('shows the celebration card, with streak, once every item is checked', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery(entries.map((e) => ({ ...e, status: 'checked' }))),
    );
    mockUsePaydayCompletionHistory.mockReturnValue(
      okQuery([
        { payday_date: '2026-09-05', status: 'checked' },
        { payday_date: '2026-08-05', status: 'checked' },
      ]),
    );
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Payday sorted')).toBeTruthy());
    expect(getByText('3 paydays in a row')).toBeTruthy();
  });

  it('edits an item amount', async () => {
    const { getByText, getByDisplayValue } = await renderWithTheme(<PaydayChecklist />);

    await fireEvent.press(await waitFor(() => getByText('₱ 1,500')));
    const input = await waitFor(() => getByDisplayValue('1500'));
    await fireEvent.changeText(input, '1800');
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateAmountMutateAsync).toHaveBeenCalledWith({ id: 'entry-1', amount: 1800 }),
    );
  });

  // Regression: the tab stays mounted, so ledger rows for a category/bill added
  // after the first visit never appeared until an app reload.
  it('re-materializes the payday when a bill item is added while mounted', async () => {
    const { rerender } = await renderWithTheme(<PaydayChecklist />);
    const themed = (
      <ThemeProvider>
        <PaydayChecklist />
      </ThemeProvider>
    );
    await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledTimes(1));

    mockUseHouseholdBillItems.mockReturnValue(okQuery([{ id: 'bill-1', amount: 1200, recurring_day: 5, categories: { start_month: '2026-10-01', end_month: null } }]));
    await rerender(themed);

    await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledTimes(2));
    expect(mockMaterializeMutate).toHaveBeenLastCalledWith(expect.any(String));
  });

  it('re-materializes the payday when a category is added while mounted', async () => {
    const { rerender } = await renderWithTheme(<PaydayChecklist />);
    const themed = (
      <ThemeProvider>
        <PaydayChecklist />
      </ThemeProvider>
    );
    await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledTimes(1));

    mockUseCategories.mockReturnValue(okQuery([{ id: 'cat-new', kind: 'fund', start_month: '2026-10-01', end_month: null, }]));
    await rerender(themed);

    await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledTimes(2));
  });

  it('does not re-materialize on a re-render with unchanged inputs', async () => {
    const { rerender } = await renderWithTheme(<PaydayChecklist />);
    const themed = (
      <ThemeProvider>
        <PaydayChecklist />
      </ThemeProvider>
    );
    await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledTimes(1));

    await rerender(themed);

    expect(mockMaterializeMutate).toHaveBeenCalledTimes(1);
  });

  it('shows a ₱0 fund row but leaves it out of the count', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([
        ...entries,
        {
          id: 'entry-zero',
          category_id: 'cat-excess',
          amount: 0,
          status: 'pending',
          categories: { name: 'Excess', color: '#7a8b3f', kind: 'fund', start_month: '2026-10-01', end_month: null, },
          bill_items: null,
        },
      ]),
    );

    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Excess')).toBeTruthy());
    expect(getByText('₱ 0')).toBeTruthy();
    // ...but there is nothing to tick off, so the two real rows are the whole count.
    expect(getByText('1 / 2 items checked')).toBeTruthy();
  });

  it('marks an extra deposit', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([{ ...entries[1], id: 'entry-extra', status: 'checked', manual: true }]),
    );
    const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Taiwan fund · extra')).toBeTruthy());
    expect(queryByText('Skip')).toBeNull();
  });

  it('offers no per-month skip on a fund row', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(okQuery([entries[1]]));
    const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Taiwan fund')).toBeTruthy());
    expect(queryByText('Skip')).toBeNull();
    expect(getByText('Fund contributions kept in the household.')).toBeTruthy();
  });

  // Reviewing an upcoming payday from the dashboard stepper (feedback 2026-09-28):
  // a future payday previews what materialize_payday would write, without writing it.
  describe('reviewing a payday from the stepper', () => {
    // "Today" is Nov 10 2026: next payday Dec 5, so Nov 5 is past and Jan 5 is future.
    const futurePayday = '2027-01-05';
    const pastPayday = '2026-11-05';

    beforeEach(() => {
      jest.useFakeTimers({ now: new Date(2026, 10, 10), advanceTimers: true });
    });
    afterEach(() => jest.useRealTimers());

    it('ignores a date before October 2026 and falls back to the next payday', async () => {
      jest.setSystemTime(new Date(2026, 8, 29));
      mockUseLocalSearchParams.mockReturnValue({ date: '2026-09-20' });
      mockUseLedgerEntriesForPayday.mockReturnValue(okQuery(entries));

      await renderWithTheme(<PaydayChecklist />);

      await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledWith('2026-10-05'));
      expect(mockUseLedgerEntriesForPayday).not.toHaveBeenCalledWith(expect.anything(), '2026-09-20');
    });

    it('shows a read-only preview for a future payday and never materializes it', async () => {
      mockUseLocalSearchParams.mockReturnValue({ date: futurePayday });
      mockUsePaydayPreview.mockReturnValue(
        okQuery([{ category_id: 'cat-bill', bill_item_id: null, amount: 1500 }]),
      );
      mockUseCategories.mockReturnValue(
        okQuery([{ id: 'cat-bill', name: 'Rent', color: '#c1552f', kind: 'bill', start_month: '2026-10-01', end_month: null, }]),
      );

      const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

      await waitFor(() => expect(getByText('Rent')).toBeTruthy());
      expect(getByText(/preview of what this payday will look like/)).toBeTruthy();
      expect(queryByText(/items checked/)).toBeNull();
      expect(mockMaterializeMutate).not.toHaveBeenCalled();

      await fireEvent.press(getByText('Rent'));
      expect(mockCheckMutate).not.toHaveBeenCalled();
    });

    it('does not re-materialize a past payday, only reads its existing entries', async () => {
      mockUseLocalSearchParams.mockReturnValue({ date: pastPayday });
      mockUseLedgerEntriesForPayday.mockReturnValue(okQuery(entries));

      const { getByText } = await renderWithTheme(<PaydayChecklist />);

      await waitFor(() => expect(getByText('Rent')).toBeTruthy());
      expect(mockMaterializeMutate).not.toHaveBeenCalled();
    });
  });
  // Reported bug: once a payday's date passed with the app left open, the checklist
  // kept showing (and materializing) that payday - its next-payday memo only
  // depended on incomes - and a Review `date` param pinned it even after a restart-free resume.
  describe('when the shown payday is over', () => {
    const twoPaydays = [
      { id: 'inc-1', active: true, recurring_day: 5, amount: 30000 },
      { id: 'inc-2', active: true, recurring_day: 20, amount: 25000 },
    ];
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59), advanceTimers: true });
      mockUseIncomes.mockReturnValue(okQuery(twoPaydays));
    });
    afterEach(() => jest.useRealTimers());

    const pastMidnight = () =>
      act(async () => {
        jest.advanceTimersByTime(2 * 60 * 1000);
      });

    it('moves to the next payday and materializes it, without a restart', async () => {
      await renderWithTheme(<PaydayChecklist />);
      await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledWith('2026-10-05'));

      await pastMidnight();

      await waitFor(() => expect(mockMaterializeMutate).toHaveBeenLastCalledWith('2026-10-20'));
      expect(mockUseLedgerEntriesForPayday).toHaveBeenLastCalledWith('household-1', '2026-10-20');
    });

    it('follows "next" (the dashboard Review button on the current payday) to the new payday', async () => {
      mockUseLocalSearchParams.mockReturnValue({ date: 'next' });
      await renderWithTheme(<PaydayChecklist />);
      await waitFor(() => expect(mockMaterializeMutate).toHaveBeenCalledWith('2026-10-05'));

      await pastMidnight();

      await waitFor(() => expect(mockMaterializeMutate).toHaveBeenLastCalledWith('2026-10-20'));
    });

    it('keeps a past payday opened on purpose pinned', async () => {
      mockUseLocalSearchParams.mockReturnValue({ date: '2026-10-05' });
      jest.setSystemTime(new Date(2026, 9, 6));
      await renderWithTheme(<PaydayChecklist />);
      await act(async () => {
        jest.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(mockUseLedgerEntriesForPayday).toHaveBeenLastCalledWith('household-1', '2026-10-05');
      expect(mockMaterializeMutate).not.toHaveBeenCalled();
    });
  });
});
