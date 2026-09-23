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
const mockUseGoalShortfalls = jest.fn();

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
  useGoalShortfalls: (...args: unknown[]) => mockUseGoalShortfalls(...args),
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
  mockUseGoalShortfalls.mockReturnValue(okQuery([]));
  mockUseToggleMonthSkip.mockReturnValue({ mutate: mockToggleSkipMutate });
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

  it('warns when a goal cannot be fully funded before its deadline', async () => {
    mockUseCategories.mockReturnValue(okQuery([{ id: 'cat-trip', name: 'Japan trip', kind: 'fund' }]));
    mockUseGoalShortfalls.mockReturnValue(okQuery([{ category_id: 'cat-trip', shortfall: 5000 }]));
    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText(/Japan trip will be ₱ 5,000 short by its deadline/)).toBeTruthy());
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

  it('shows a ₱0 fund row but leaves it out of the count', async () => {
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

    const { getByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Excess')).toBeTruthy());
    expect(getByText('₱ 0')).toBeTruthy();
    // ...but there is nothing to tick off, so the two real rows are the whole count.
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

  it('marks an extra deposit and offers no skip on it', async () => {
    mockUseLedgerEntriesForPayday.mockReturnValue(
      okQuery([{ ...entries[1], id: 'entry-extra', status: 'checked', manual: true }]),
    );
    const { getByText, queryByText } = await renderWithTheme(<PaydayChecklist />);

    await waitFor(() => expect(getByText('Taiwan fund · extra')).toBeTruthy());
    expect(queryByText('Skip')).toBeNull();
  });
});
