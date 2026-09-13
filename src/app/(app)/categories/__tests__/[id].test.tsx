import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams = { id: 'cat-fund' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryHistory = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseBillItems = jest.fn();
const mockUseAddManualContribution = jest.fn();
const mockUseCreateBillItem = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryHistory: (...args: unknown[]) => mockUseCategoryHistory(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useBillItems: (...args: unknown[]) => mockUseBillItems(...args),
  useAddManualContribution: (...args: unknown[]) => mockUseAddManualContribution(...args),
  useCreateBillItem: (...args: unknown[]) => mockUseCreateBillItem(...args),
}));

import CategoryDetail from '../[id]';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const fundCategory = {
  id: 'cat-fund',
  name: 'Taiwan fund',
  kind: 'fund',
  color: '#1f5c56',
  rule: { type: 'goal', target_amount: 50000 },
};
const billCategory = {
  id: 'cat-bill',
  name: 'Rent',
  kind: 'bill',
  color: '#c1552f',
  rule: null,
};
const history = [
  { id: 'h1', amount: 5000, payday_date: '2026-09-05', checked_by: 'user-1' },
  { id: 'h2', amount: 3000, payday_date: '2026-08-05', checked_by: null },
];
const members = [{ id: 'member-1', user_id: 'user-1', display_name: 'Leo' }];

const mockAddContributionMutateAsync = jest.fn();
const mockCreateBillItemMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.id = 'cat-fund';
  mockUseHouseholdMembership.mockReturnValue({ data: member });
  mockUseCategories.mockReturnValue({ data: [fundCategory, billCategory] });
  mockUseCategoryHistory.mockReturnValue({ data: history });
  mockUseHouseholdMembers.mockReturnValue({ data: members });
  mockUseBillItems.mockReturnValue({ data: [] });
  mockUseAddManualContribution.mockReturnValue({
    mutateAsync: mockAddContributionMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUseCreateBillItem.mockReturnValue({
    mutateAsync: mockCreateBillItemMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
});

describe('CategoryDetail', () => {
  it('renders a fund category balance, goal progress and history with realistic data', async () => {
    const { getByText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('Taiwan fund')).toBeTruthy());
    expect(getByText('₱ 8,000')).toBeTruthy();
    expect(getByText(/of ₱ 50,000 goal/)).toBeTruthy();
    expect(getByText(/· Leo/)).toBeTruthy();
    expect(getByText(/· Manual entry/)).toBeTruthy();
  });

  it('shows an empty state when there is no history yet', async () => {
    mockUseCategoryHistory.mockReturnValue({ data: [] });
    const { getByText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('Nothing checked off yet.')).toBeTruthy());
  });

  it('adds a manual contribution to a fund category', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('+ Add contribution')));
    await fireEvent.changeText(getByPlaceholderText('₱0'), '2500');
    await fireEvent.press(getByText('Save'));

    await waitFor(() => expect(mockAddContributionMutateAsync).toHaveBeenCalledWith({ amount: 2500 }));
  });

  it('renders a bill category with its line items and lets you add one', async () => {
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [{ id: 'bi-1', label: 'Base rent', amount: 1500, recurring_day: 5, end_date: null }],
    });

    const { getByText, getByPlaceholderText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('Base rent')).toBeTruthy());
    expect(getByText('Line items')).toBeTruthy();

    await fireEvent.press(getByText('+ Add item'));
    await fireEvent.changeText(getByPlaceholderText('e.g. Internet'), 'Internet');
    await fireEvent.changeText(getByPlaceholderText('₱0'), '900');
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockCreateBillItemMutateAsync).toHaveBeenCalledWith({
        label: 'Internet',
        amount: 900,
        recurring_day: 5,
      }),
    );
  });

  it('navigates back to the category list', async () => {
    const { getByText } = await renderWithTheme(<CategoryDetail />);
    await fireEvent.press(await waitFor(() => getByText('‹ Categories')));
    expect(mockBack).toHaveBeenCalled();
  });
});
