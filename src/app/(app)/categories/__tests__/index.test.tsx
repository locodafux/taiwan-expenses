import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseCategoryBalances = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useHouseholdBillItems: (...args: unknown[]) => mockUseHouseholdBillItems(...args),
  useCategoryBalances: (...args: unknown[]) => mockUseCategoryBalances(...args),
}));

import CategoryManagement from '../index';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const categories = [
  { id: 'cat-fund', name: 'Taiwan fund', kind: 'fund', color: '#1f5c56', rule: { type: 'goal', target_amount: 50000 } },
  { id: 'cat-bill', name: 'Rent & utilities', kind: 'bill', color: '#c1552f', rule: null },
];
const billItems = [
  { id: 'bill-1', category_id: 'cat-bill', label: 'Rent', amount: 1500, recurring_day: 5 },
  { id: 'bill-2', category_id: 'cat-bill', label: 'Electric', amount: 300, recurring_day: 5 },
];

function okQuery<T>(data: T) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue(okQuery(member));
  mockUseCategories.mockReturnValue(okQuery(categories));
  mockUseHouseholdBillItems.mockReturnValue(okQuery(billItems));
  mockUseCategoryBalances.mockReturnValue(okQuery({ 'cat-fund': 12000 }));
});

describe('CategoryManagement', () => {
  it('renders each category with its type, goal and bill-item count', async () => {
    const { getByText } = await renderWithTheme(<CategoryManagement />);

    await waitFor(() => expect(getByText('Taiwan fund')).toBeTruthy());
    expect(getByText(/Goal · target ₱50,000/)).toBeTruthy();
    expect(getByText('Rent & utilities')).toBeTruthy();
    expect(getByText('Bill · 2 recurring items')).toBeTruthy();
  });

  // Shares are weights: 30 and 20 split the left-over 60/40, and the list says so.
  it('states each remainder fund\'s share and what it actually gets', async () => {
    mockUseCategories.mockReturnValue(
      okQuery([
        { id: 'a', name: 'Taiwan', kind: 'fund', color: '#111', rule: { type: 'remainder', percent: 30 } },
        { id: 'b', name: 'Savings', kind: 'fund', color: '#222', rule: { type: 'remainder', percent: 20 } },
      ]),
    );
    const { getByText } = await renderWithTheme(<CategoryManagement />);

    await waitFor(() => expect(getByText("30% share · gets 60% of what's left")).toBeTruthy());
    expect(getByText("20% share · gets 40% of what's left")).toBeTruthy();
  });

  it('shows an empty state when there are no categories yet', async () => {
    mockUseCategories.mockReturnValue(okQuery([]));
    const { getByText } = await renderWithTheme(<CategoryManagement />);

    await waitFor(() => expect(getByText('No categories yet.')).toBeTruthy());
  });

  it('shows an error state with retry when a query fails', async () => {
    const refetch = jest.fn();
    mockUseCategories.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    const { getByText } = await renderWithTheme(<CategoryManagement />);

    const retry = await waitFor(() => getByText('Retry'));
    await fireEvent.press(retry);
    expect(refetch).toHaveBeenCalled();
  });

  it('navigates to add a new category', async () => {
    const { getByText } = await renderWithTheme(<CategoryManagement />);
    await fireEvent.press(await waitFor(() => getByText('+ Add')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/categories/add');
  });

  it('navigates to a category detail on row press', async () => {
    const { getByText } = await renderWithTheme(<CategoryManagement />);
    await fireEvent.press(await waitFor(() => getByText('Taiwan fund')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/categories/cat-fund');
  });
});
