import { waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';
import { addMonths, fromDateOnly, toDateOnly } from '@/lib/payday';

jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }) }));

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryBalances = jest.fn();
const mockUseFundTotalsForecast = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryBalances: (...args: unknown[]) => mockUseCategoryBalances(...args),
  useFundTotalsForecast: (...args: unknown[]) => mockUseFundTotalsForecast(...args),
}));

import SummaryOfAll from '../summary';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const currentMonth = toDateOnly(new Date()).slice(0, 7);
const goalMonth = addMonths(currentMonth, 2);
const goalMonthLabel = fromDateOnly(`${goalMonth}-01`).toLocaleDateString(undefined, {
  month: 'long',
  year: 'numeric',
});

const categories = [
  { id: 'cat-rent', kind: 'bill', name: 'RENT', color: '#c0392b', rule: null, archived: false, sort_order: 0 },
  {
    id: 'cat-taiwan',
    kind: 'fund',
    name: 'TAIWAN',
    color: '#3b6fa0',
    rule: { type: 'goal', target_amount: 80000, target_date: `${goalMonth}-15` },
    archived: false,
    sort_order: 1,
  },
  {
    id: 'cat-savings',
    kind: 'fund',
    name: 'SAVINGS',
    color: '#6b4c9a',
    rule: { type: 'remainder', percent: 100 },
    archived: false,
    sort_order: 2,
  },
  {
    id: 'cat-excess-kid',
    kind: 'fund',
    name: 'EXCESS KID',
    color: '#2f9e6e',
    rule: { type: 'group_child', parent_id: 'cat-savings', percent: 50 },
    archived: false,
    sort_order: 3,
  },
  {
    id: 'cat-old',
    kind: 'fund',
    name: 'OLD FUND',
    color: '#999999',
    rule: { type: 'remainder', percent: 0 },
    archived: true,
    sort_order: 4,
  },
];

const balances = {
  'cat-rent': 15000,
  'cat-taiwan': 50000,
  'cat-savings': 3000,
  'cat-excess-kid': 500,
  'cat-old': 200,
};

const forecast = [
  { category_id: 'cat-taiwan', month_index: 1, amount: 10000 },
  { category_id: 'cat-taiwan', month_index: 2, amount: 10000 },
  { category_id: 'cat-taiwan', month_index: 3, amount: 10000 },
  { category_id: 'cat-savings', month_index: 1, amount: 1000 },
  { category_id: 'cat-savings', month_index: 2, amount: 1000 },
  { category_id: 'cat-savings', month_index: 3, amount: 1000 },
];

const ok = { isLoading: false, isError: false, refetch: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ ...ok, data: member });
  mockUseCategories.mockReturnValue({ ...ok, data: categories });
  mockUseCategoryBalances.mockReturnValue({ ...ok, data: balances });
  mockUseFundTotalsForecast.mockReturnValue({ ...ok, data: forecast });
});

describe('SummaryOfAll', () => {
  it('shows a bill category as paid to date, not projected', async () => {
    const { getByText } = await renderWithTheme(<SummaryOfAll />);

    await waitFor(() => expect(getByText('RENT')).toBeTruthy());
    expect(getByText('Paid to date')).toBeTruthy();
    expect(getByText('₱ 15,000')).toBeTruthy();
  });

  it('projects a goal fund to its own target date and flags it complete once the total reaches the goal', async () => {
    const { getByText } = await renderWithTheme(<SummaryOfAll />);

    await waitFor(() => expect(getByText('TAIWAN')).toBeTruthy());
    expect(getByText('₱ 80,000')).toBeTruthy();
    expect(getByText('Complete · target ₱80,000')).toBeTruthy();
  });

  it('projects a fund with no goal of its own to the household\'s furthest goal date', async () => {
    const { getByText, getAllByText } = await renderWithTheme(<SummaryOfAll />);

    await waitFor(() => expect(getByText('SAVINGS')).toBeTruthy());
    expect(getByText('₱ 6,000')).toBeTruthy();
    // OLD FUND shares the same caption (no goal of its own either), so both rows show it.
    expect(getAllByText(`Projected by ${goalMonthLabel}`).length).toBeGreaterThan(0);
  });

  it('shows a linked group/excess child as its current balance only, not a projection', async () => {
    const { getByText } = await renderWithTheme(<SummaryOfAll />);

    await waitFor(() => expect(getByText('EXCESS KID')).toBeTruthy());
    expect(getByText('₱ 500')).toBeTruthy();
    expect(getByText('Linked to SAVINGS · current balance')).toBeTruthy();
  });

  it('includes archived categories, tagged as archived', async () => {
    const { getByText } = await renderWithTheme(<SummaryOfAll />);

    await waitFor(() => expect(getByText('OLD FUND · Archived')).toBeTruthy());
  });

  it('shows an error state that can be retried', async () => {
    mockUseCategories.mockReturnValue({ ...ok, isError: true });
    const { getByText } = await renderWithTheme(<SummaryOfAll />);

    await waitFor(() => expect(getByText(/Couldn't load/)).toBeTruthy());
  });
});
