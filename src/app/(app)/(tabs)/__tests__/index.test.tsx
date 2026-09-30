import { fireEvent, waitFor } from '@testing-library/react-native';

import { nextPayday, paydayAtOffset, toDateOnly } from '@/lib/payday';
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

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryBalances: (...args: unknown[]) => mockUseCategoryBalances(...args),
  useCategoryBalancesThisMonth: (...args: unknown[]) => mockUseCategoryBalancesThisMonth(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  usePaydayAmounts: (...args: unknown[]) => mockUsePaydayAmounts(...args),
}));

import Dashboard from '../index';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const members = [
  { id: 'member-1', display_name: 'Leo', color: '#c1552f' },
  { id: 'member-2', display_name: 'Alex', color: '#1f5c56' },
];
const categories = [
  { id: 'cat-fund', name: 'Taiwan fund', kind: 'fund', start_month: '2026-10-01', end_month: null, color: '#1f5c56', rule: { type: 'goal', target_amount: 50000 } },
  { id: 'cat-bill', name: 'Rent', kind: 'bill', start_month: '2026-10-01', end_month: null, color: '#c1552f', rule: null },
];
const incomes = [{ id: 'inc-1', active: true, recurring_day: 5, amount: 30000 }];

function okQuery<T>(data: T) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

afterEach(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue(okQuery(member));
  mockUseHouseholdMembers.mockReturnValue(okQuery(members));
  mockUseCategories.mockReturnValue(okQuery(categories));
  mockUseCategoryBalances.mockReturnValue(okQuery({ 'cat-fund': 12000, 'cat-bill': 0 }));
  mockUseCategoryBalancesThisMonth.mockReturnValue(okQuery({ 'cat-bill': 3500 }));
  mockUseIncomes.mockReturnValue(okQuery(incomes));
  mockUsePaydayAmounts.mockReturnValue(okQuery({}));
});

describe('Dashboard', () => {
  it('renders categories and the next payday with realistic data', async () => {
    const { getByText, getAllByText } = await renderWithTheme(<Dashboard />);

    await waitFor(() => expect(getByText('Taiwan fund')).toBeTruthy());
    expect(getByText('Rent')).toBeTruthy();
    // The fund summary's amount and the category list.
    expect(getAllByText(/₱\s?12,000/)).toHaveLength(2);
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

  it('navigates to the checklist for the selected payday from the next-payday card', async () => {
    const { getByText } = await renderWithTheme(<Dashboard />);
    await fireEvent.press(await waitFor(() => getByText('Review')));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/checklist',
      params: { date: toDateOnly(nextPayday([5])) },
    });
  });

  it('reviews the currently-stepped-to payday, not always the next one', async () => {
    const { getByLabelText, getByText } = await renderWithTheme(<Dashboard />);
    await waitFor(() => expect(getByText(/^Next payday/)).toBeTruthy());

    await fireEvent.press(getByLabelText('Next payday'));
    await fireEvent.press(await waitFor(() => getByText('Review')));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/checklist',
      params: { date: toDateOnly(paydayAtOffset([5], 1)) },
    });
  });

  it('steps through previous and further upcoming paydays', async () => {
    mockUseIncomes.mockReturnValue(
      okQuery([
        { id: 'inc-1', active: true, recurring_day: 5, amount: 30000 },
        { id: 'inc-2', active: true, recurring_day: 20, amount: 25000 },
      ]),
    );
    jest.useFakeTimers({ now: new Date(2026, 10, 10), advanceTimers: true });
    const { getByLabelText, getByText } = await renderWithTheme(<Dashboard />);

    expect(getByText(/^Next payday/)).toBeTruthy();
    await fireEvent.press(getByLabelText('Previous payday'));
    expect(getByText(/^Previous payday/)).toBeTruthy();
    await fireEvent.press(getByLabelText('Next payday'));
    await fireEvent.press(getByLabelText('Next payday'));
    expect(getByText(/^Upcoming payday/)).toBeTruthy();
  });

  // The app starts in October 2026: on the real Sep 29 it shows Oct 5 (not
  // Sep 30) as the next payday and cannot step back into September.
  it('never shows or steps to a payday before October 2026, even when today is in September', async () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 29), advanceTimers: true });
    mockUseIncomes.mockReturnValue(
      okQuery([
        { id: 'inc-1', active: true, recurring_day: 5, amount: 30000 },
        { id: 'inc-2', active: true, recurring_day: 30, amount: 25000 },
      ]),
    );
    const { getByLabelText, getByText, queryByText } = await renderWithTheme(<Dashboard />);

    expect(getByText(/^Next payday · 5th/)).toBeTruthy();
    await fireEvent.press(getByLabelText('Previous payday'));
    expect(getByText(/^Next payday · 5th/)).toBeTruthy();
    expect(queryByText(/^Previous payday/)).toBeNull();
    // Reviewing it opens the checklist on that October payday.
    await fireEvent.press(getByText('Review'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/checklist',
      params: { date: '2026-10-05' },
    });
  });

  it('has no saved-this-quarter card or streak', async () => {
    const { queryByText } = await renderWithTheme(<Dashboard />);

    await waitFor(() => expect(queryByText('Taiwan fund')).toBeTruthy());
    expect(queryByText('Saved this quarter')).toBeNull();
    expect(queryByText(/streak/i)).toBeNull();
  });

  it('charts the household’s Taiwan, Emergency and Savings funds with progress toward a goal or the plan', async () => {
    mockUseCategories.mockReturnValue(
      okQuery([
        { id: 'tw', name: 'Taiwan fund', kind: 'fund', start_month: '2026-10-01', end_month: null, color: null, rule: { type: 'group_child', parent_id: 'x', percent: 50, goal: { target_amount: 80000 } } },
        { id: 'em', name: 'Emergency Fund', kind: 'fund', start_month: '2026-10-01', end_month: null, color: null, rule: { type: 'group_child', parent_id: 'x', percent: 15 } },
        { id: 'sv', name: 'Savings', kind: 'fund', start_month: '2026-10-01', end_month: null, color: null, rule: { type: 'group_child', parent_id: 'x', percent: 25 } },
      ]),
    );
    mockUseCategoryBalances.mockReturnValue(okQuery({ tw: 20000, em: 5000, sv: 0 }));
    const { getByText, getAllByText, queryByTestId } = await renderWithTheme(<Dashboard />);

    expect(await waitFor(() => getByText('Fund summary'))).toBeTruthy();
    // Legend labels are fixed names; the category list below shows the household's own.
    expect(getByText('Taiwan Fund')).toBeTruthy();
    expect(getAllByText('Emergency Fund')).toHaveLength(2);
    expect(getAllByText('Savings')).toHaveLength(2);
    expect(getByText(/25% of ₱\s?80,000/)).toBeTruthy();
    // Emergency and Savings have no stored goal, so they show the plan-by-March total.
    expect(getByText(/21% of ₱\s?23,750 \(plan by March\)/)).toBeTruthy();
    expect(getByText(/0% of ₱\s?23,750 \(plan by March\)/)).toBeTruthy();
    expect(getAllByText(/% of /)).toHaveLength(3);
    expect(getAllByText(/₱\s?5,000/)).toHaveLength(2);
    // No line chart any more.
    expect(queryByTestId('fund-line-tw')).toBeNull();
  });

  it('frames the fund summary as an intentional empty state when nothing is saved', async () => {
    mockUseCategories.mockReturnValue(
      okQuery([{ id: 'tw', name: 'Taiwan fund', kind: 'fund', start_month: '2026-10-01', end_month: null, color: null, rule: { type: 'goal', target_amount: 80000 } }]),
    );
    mockUseCategoryBalances.mockReturnValue(okQuery({}));
    const { getByText } = await renderWithTheme(<Dashboard />);

    expect(await waitFor(() => getByText(/Nothing saved yet/))).toBeTruthy();
    expect(getByText(/0% of ₱\s?80,000/)).toBeTruthy();
  });

  it('leaves out the fund summary when the household has none of those funds', async () => {
    mockUseCategories.mockReturnValue(
      okQuery([{ id: 'bill', name: 'Rent', kind: 'bill', start_month: '2026-10-01', end_month: null, color: null, rule: null }]),
    );
    const { queryByText, getByText } = await renderWithTheme(<Dashboard />);

    await waitFor(() => expect(getByText('Rent')).toBeTruthy());
    expect(queryByText('Fund summary')).toBeNull();
  });
});
