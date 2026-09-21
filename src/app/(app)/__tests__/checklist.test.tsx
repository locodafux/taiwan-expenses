import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';
import { ThemeProvider } from '@/theme/ThemeProvider';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseIncomes = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseCategories = jest.fn();
const mockUseLedgerEntriesForPayday = jest.fn();
const mockUseMaterializePayday = jest.fn();
const mockUseCheckLedgerEntry = jest.fn();
const mockUseUpdateLedgerAmount = jest.fn();
const mockUsePaydayCompletionHistory = jest.fn();
const mockUseToggleMonthSkip = jest.fn();
const mockUseAddManualContribution = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  useHouseholdBillItems: (...args: unknown[]) => mockUseHouseholdBillItems(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useLedgerEntriesForPayday: (...args: unknown[]) => mockUseLedgerEntriesForPayday(...args),
  useMaterializePayday: (...args: unknown[]) => mockUseMaterializePayday(...args),
  useCheckLedgerEntry: (...args: unknown[]) => mockUseCheckLedgerEntry(...args),
  useUpdateLedgerAmount: (...args: unknown[]) => mockUseUpdateLedgerAmount(...args),
  usePaydayCompletionHistory: (...args: unknown[]) => mockUsePaydayCompletionHistory(...args),
  useToggleMonthSkip: (...args: unknown[]) => mockUseToggleMonthSkip(...args),
  useAddManualContribution: (...args: unknown[]) => mockUseAddManualContribution(...args),
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
    categories: { name: 'Rent', color: '#c1552f', kind: 'bill' },
    bill_items: { label: 'Rent' },
  },
  {
    id: 'entry-2',
    category_id: 'cat-fund',
    amount: 2000,
    status: 'checked',
    categories: { name: 'Taiwan fund', color: '#1f5c56', kind: 'fund' },
    bill_items: null,
  },
];

function okQuery<T>(data: T) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

const mockCheckMutate = jest.fn();
const mockMaterializeMutate = jest.fn();
const mockUpdateAmountMutateAsync = jest.fn();
const mockToggleSkipMutate = jest.fn();
const mockAddToFundMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue(okQuery(member));
  mockUseIncomes.mockReturnValue(okQuery(incomes));
  mockUseHouseholdBillItems.mockReturnValue(okQuery([]));
  mockUseCategories.mockReturnValue(okQuery([]));
  mockUseLedgerEntriesForPayday.mockReturnValue(okQuery(entries));
  mockUseMaterializePayday.mockReturnValue({ mutate: mockMaterializeMutate });
  mockUseCheckLedgerEntry.mockReturnValue({ mutate: mockCheckMutate });
  mockUseUpdateLedgerAmount.mockReturnValue({
    mutateAsync: mockUpdateAmountMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUsePaydayCompletionHistory.mockReturnValue(okQuery([]));
  mockUseToggleMonthSkip.mockReturnValue({ mutate: mockToggleSkipMutate });
  mockUseAddManualContribution.mockReturnValue({
    mutateAsync: mockAddToFundMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
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

    mockUseHouseholdBillItems.mockReturnValue(okQuery([{ id: 'bill-1', amount: 1200, recurring_day: 5 }]));
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

    mockUseCategories.mockReturnValue(okQuery([{ id: 'cat-new', kind: 'fund' }]));
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

  it('hides a ₱0 fund row - there is nothing to set aside for it', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([
        ...entries,
        {
          id: 'entry-zero',
          category_id: 'cat-excess',
          amount: 0,
          status: 'pending',
          categories: { name: 'Excess', color: '#7a8b3f', kind: 'fund' },
          bill_items: null,
        },
      ]),
    );

    const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Taiwan fund')).toBeTruthy());
    expect(queryByText('Excess')).toBeNull();
    // ...and it is out of the count, so the two real rows are the whole list.
    expect(getByText('1 / 2 items checked')).toBeTruthy();
  });

  it('keeps a skipped fund visible but out of the progress count', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([
        ...entries,
        {
          id: 'entry-skipped',
          category_id: 'cat-savings',
          amount: 0,
          status: 'skipped',
          categories: { name: 'Savings', color: '#7a8b3f', kind: 'fund' },
          bill_items: null,
        },
      ]),
    );

    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Savings')).toBeTruthy());
    expect(getByText('Skipped')).toBeTruthy();
    expect(getByText('1 / 2 items checked')).toBeTruthy();
  });

  it('skips and un-skips a fund for the month', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([
        entries[1],
        {
          id: 'entry-skipped',
          category_id: 'cat-savings',
          amount: 0,
          status: 'skipped',
          categories: { name: 'Savings', color: '#7a8b3f', kind: 'fund' },
          bill_items: null,
        },
      ]),
    );

    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await fireEvent.press(await waitFor(() => getByText('Skip')));
    expect(mockToggleSkipMutate).toHaveBeenCalledWith({ categoryId: 'cat-fund', skipped: true });

    await fireEvent.press(getByText('Unskip'));
    expect(mockToggleSkipMutate).toHaveBeenCalledWith({ categoryId: 'cat-savings', skipped: false });
  });

  it('offers no skip on a bill - bills are not optional', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(okQuery([entries[0]]));

    const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Rent')).toBeTruthy());
    expect(queryByText('Skip')).toBeNull();
  });

  describe('left over', () => {
    const funds = [
      { id: 'cat-fund', kind: 'fund', name: 'Taiwan fund', color: '#1f5c56' },
      { id: 'cat-savings', kind: 'fund', name: 'Savings', color: '#7a8b3f' },
    ];

    // 30000 take-home - 1500 rent - 2000 fund = 26500 nothing is using.
    it('adds what is left to the chosen fund, dated to this payday', async () => {
      mockUseCategories.mockReturnValue(okQuery(funds));
      const { getByText } = await renderWithTheme(<PaydayChecklist />);

      await waitFor(() => expect(getByText('₱ 26,500 left over')).toBeTruthy());
      await fireEvent.press(getByText('Savings'));
      await fireEvent.press(getByText("Add what's left to Savings"));

      expect(mockAddToFundMutateAsync).toHaveBeenCalledWith({
        categoryId: 'cat-savings',
        amount: 26500,
        paydayDate: expect.stringMatching(/^\d{4}-\d{2}-05$/),
      });
    });

    it('adds a typed amount instead', async () => {
      mockUseCategories.mockReturnValue(okQuery(funds));
      const { getByText, getByPlaceholderText } = await renderWithTheme(<PaydayChecklist />);

      await fireEvent.changeText(await waitFor(() => getByPlaceholderText('₱ 26,500')), '1000');
      await fireEvent.press(getByText('Add ₱ 1,000 to Taiwan fund'));

      expect(mockAddToFundMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-fund', amount: 1000 }),
      );
    });

    it('hides when the checklist already uses the whole take-home', async () => {
      mockUseCategories.mockReturnValue(okQuery(funds));
      mockUseLedgerEntriesForPayday.mockReturnValue(
        okQuery([entries[0], { ...entries[1], amount: 28500 }]),
      );
      const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

      await waitFor(() => expect(getByText('Rent')).toBeTruthy());
      expect(queryByText(/left over/)).toBeNull();
    });

    it('marks an extra deposit and offers no skip on it', async () => {
      mockUseLedgerEntriesForPayday.mockReturnValue(
        okQuery([{ ...entries[1], id: 'entry-extra', status: 'checked', manual: true }]),
      );
      const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

      await waitFor(() => expect(getByText('Taiwan fund · extra')).toBeTruthy());
      expect(queryByText('Skip')).toBeNull();
    });
  });
});
