import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryBalances = jest.fn();
const mockUseCategoryBalancesThisMonth = jest.fn();
const mockUseIncomes = jest.fn();
const mockUsePaydayAmounts = jest.fn();
const mockUseSavedThisQuarter = jest.fn();
const mockUsePaydayStreak = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryBalances: (...args: unknown[]) => mockUseCategoryBalances(...args),
  useCategoryBalancesThisMonth: (...args: unknown[]) => mockUseCategoryBalancesThisMonth(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  usePaydayAmounts: (...args: unknown[]) => mockUsePaydayAmounts(...args),
  useSavedThisQuarter: (...args: unknown[]) => mockUseSavedThisQuarter(...args),
  usePaydayStreak: (...args: unknown[]) => mockUsePaydayStreak(...args),
}));

import Dashboard from '../index';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const members = [
  { id: 'member-1', display_name: 'Leo', color: '#c1552f' },
  { id: 'member-2', display_name: 'Alex', color: '#1f5c56' },
];
const categories = [
  { id: 'cat-fund', name: 'Taiwan fund', kind: 'fund', color: '#1f5c56', rule: { type: 'goal', target_amount: 50000 } },
  { id: 'cat-bill', name: 'Rent', kind: 'bill', color: '#c1552f', rule: null },
];
const incomes = [{ id: 'inc-1', active: true, recurring_day: 5, amount: 30000 }];

function okQuery<T>(data: T) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue(okQuery(member));
  mockUseHouseholdMembers.mockReturnValue(okQuery(members));
  mockUseCategories.mockReturnValue(okQuery(categories));
  mockUseCategoryBalances.mockReturnValue(okQuery({ 'cat-fund': 12000, 'cat-bill': 0 }));
  mockUseCategoryBalancesThisMonth.mockReturnValue(okQuery({ 'cat-bill': 3500 }));
  mockUseIncomes.mockReturnValue(okQuery(incomes));
  mockUsePaydayAmounts.mockReturnValue(okQuery({}));
  mockUseSavedThisQuarter.mockReturnValue(okQuery(18500));
  mockUsePaydayStreak.mockReturnValue(okQuery(3));
});

describe('Dashboard', () => {
  it('renders household members, categories and the next payday with realistic data', async () => {
    const { getByText } = await renderWithTheme(<Dashboard />);

    await waitFor(() => expect(getByText('Taiwan fund')).toBeTruthy());
    expect(getByText('Rent')).toBeTruthy();
    expect(getByText(/Leo & Alex/)).toBeTruthy();
    expect(getByText(/₱\s?12,000/)).toBeTruthy();
    expect(getByText(/₱\s?3,500 this month/)).toBeTruthy();
    expect(getByText(/^Next payday/)).toBeTruthy();
  });

  it('shows the empty state when there are no categories yet', async () => {
    mockUseCategories.mockReturnValue(okQuery([]));
    const { getByText } = await renderWithTheme(<Dashboard />);

    await waitFor(() =>
      expect(getByText('No categories yet — add one from the Categories tab.')).toBeTruthy(),
    );
  });

  it('shows an error state with retry when any underlying query fails', async () => {
    const refetch = jest.fn();
    mockUseCategories.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    const { getByText } = await renderWithTheme(<Dashboard />);

    const retry = await waitFor(() => getByText('Retry'));
    await fireEvent.press(retry);
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a loading state instead of stale content while categories are still loading', async () => {
    mockUseCategories.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
    const { queryByText } = await renderWithTheme(<Dashboard />);

    expect(queryByText('Taiwan fund')).toBeNull();
    expect(queryByText(/^Next payday/)).toBeNull();
    expect(queryByText('Retry')).toBeNull();
  });

  it('navigates to a category on press', async () => {
    const { getByText } = await renderWithTheme(<Dashboard />);
    await fireEvent.press(await waitFor(() => getByText('Taiwan fund')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/categories/cat-fund');
  });

  it('navigates to the checklist from the next-payday card', async () => {
    const { getByText } = await renderWithTheme(<Dashboard />);
    await fireEvent.press(await waitFor(() => getByText('Review')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/checklist');
  });

  it('steps through previous and further upcoming paydays', async () => {
    mockUseIncomes.mockReturnValue(
      okQuery([
        { id: 'inc-1', active: true, recurring_day: 5, amount: 30000 },
        { id: 'inc-2', active: true, recurring_day: 20, amount: 25000 },
      ]),
    );
    const { getByLabelText, getByText } = await renderWithTheme(<Dashboard />);

    expect(getByText(/^Next payday/)).toBeTruthy();
    await fireEvent.press(getByLabelText('Previous payday'));
    expect(getByText(/^Previous payday/)).toBeTruthy();
    await fireEvent.press(getByLabelText('Next payday'));
    await fireEvent.press(getByLabelText('Next payday'));
    expect(getByText(/^Upcoming payday/)).toBeTruthy();
  });

  it('renders the momentum row (saved-this-quarter stat + streak chip) when data is present', async () => {
    const { getByText } = await renderWithTheme(<Dashboard />);

    expect(await waitFor(() => getByText('Saved this quarter'))).toBeTruthy();
    expect(getByText(/₱\s?18,500/)).toBeTruthy();
    expect(getByText('3-payday streak')).toBeTruthy();
  });

  it('shows a start-streak chip instead of a count when there is no streak yet', async () => {
    mockUsePaydayStreak.mockReturnValue(okQuery(0));
    const { getByText } = await renderWithTheme(<Dashboard />);

    expect(await waitFor(() => getByText('Start your streak'))).toBeTruthy();
  });

  it('omits the momentum row while its data is still loading', async () => {
    mockUseSavedThisQuarter.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
    const { queryByText } = await renderWithTheme(<Dashboard />);

    await waitFor(() => expect(queryByText('Taiwan fund')).toBeTruthy());
    expect(queryByText('Saved this quarter')).toBeNull();
  });
});
