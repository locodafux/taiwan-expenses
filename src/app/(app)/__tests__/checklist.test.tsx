import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseIncomes = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseLedgerEntriesForPayday = jest.fn();
const mockUseMaterializePayday = jest.fn();
const mockUseCheckLedgerEntry = jest.fn();
const mockUseUpdateLedgerAmount = jest.fn();
const mockUsePaydayCompletionHistory = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  useHouseholdBillItems: (...args: unknown[]) => mockUseHouseholdBillItems(...args),
  useLedgerEntriesForPayday: (...args: unknown[]) => mockUseLedgerEntriesForPayday(...args),
  useMaterializePayday: (...args: unknown[]) => mockUseMaterializePayday(...args),
  useCheckLedgerEntry: (...args: unknown[]) => mockUseCheckLedgerEntry(...args),
  useUpdateLedgerAmount: (...args: unknown[]) => mockUseUpdateLedgerAmount(...args),
  usePaydayCompletionHistory: (...args: unknown[]) => mockUsePaydayCompletionHistory(...args),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue(okQuery(member));
  mockUseIncomes.mockReturnValue(okQuery(incomes));
  mockUseHouseholdBillItems.mockReturnValue(okQuery([]));
  mockUseLedgerEntriesForPayday.mockReturnValue(okQuery(entries));
  mockUseMaterializePayday.mockReturnValue({ mutate: mockMaterializeMutate });
  mockUseCheckLedgerEntry.mockReturnValue({ mutate: mockCheckMutate });
  mockUseUpdateLedgerAmount.mockReturnValue({
    mutateAsync: mockUpdateAmountMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUsePaydayCompletionHistory.mockReturnValue(okQuery([]));
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
    expect(getByText('🔥 3 paydays in a row')).toBeTruthy();
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
});
