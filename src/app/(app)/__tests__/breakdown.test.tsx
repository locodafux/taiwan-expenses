import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';
import { addMonths, toDateOnly } from '@/lib/payday';

jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseIncomes = jest.fn();
const mockUseMonthlyLedgerTotals = jest.fn();
const mockUseFundTotalsForecast = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useHouseholdBillItems: (...args: unknown[]) => mockUseHouseholdBillItems(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  useMonthlyLedgerTotals: (...args: unknown[]) => mockUseMonthlyLedgerTotals(...args),
  useFundTotalsForecast: (...args: unknown[]) => mockUseFundTotalsForecast(...args),
}));

import Breakdown from '../breakdown';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const currentMonth = toDateOnly(new Date()).slice(0, 7);
const pastMonth = addMonths(currentMonth, -1);

const categories = [
  { id: 'cat-rent', kind: 'bill', name: 'RENT', color: '#c0392b', rule: null, sort_order: 0 },
  { id: 'cat-savings', kind: 'fund', name: 'SAVINGS', color: '#3b6fa0', rule: { type: 'remainder', percent: 100 }, sort_order: 1 },
  {
    id: 'cat-excess-kid',
    kind: 'fund',
    name: 'EXCESS KID',
    color: '#6b4c9a',
    rule: { type: 'group_child', parent_id: 'cat-savings', percent: 50 },
    sort_order: 2,
  },
];

const billItems = [{ category_id: 'cat-rent', amount: 5000, recurring_day: 5, end_date: null }];
const incomes = [{ amount: 20000, recurring_day: 5, active: true }];

const ok = { isLoading: false, isError: false, refetch: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ ...ok, data: member });
  mockUseCategories.mockReturnValue({ ...ok, data: categories });
  mockUseHouseholdBillItems.mockReturnValue({ ...ok, data: billItems });
  mockUseIncomes.mockReturnValue({ ...ok, data: incomes });
  mockUseMonthlyLedgerTotals.mockReturnValue({
    ...ok,
    data: { [pastMonth]: { 'cat-savings': 3000 } },
  });
  mockUseFundTotalsForecast.mockReturnValue({
    ...ok,
    data: [{ category_id: 'cat-savings', month_index: 1, amount: 4000 }],
  });
});

// The calendar is the default view; the existing table sits behind a toggle.
async function openTable(ui: ReturnType<typeof renderWithTheme>) {
  const utils = await ui;
  await fireEvent.press(utils.getByText('Month table'));
  return utils;
}

describe('Breakdown', () => {
  it('opens on the payday calendar with October 2026 selected and the checks passing', async () => {
    const { getByText, getAllByText } = await renderWithTheme(<Breakdown />);

    expect(getAllByText('October 2026')).toHaveLength(2); // calendar header + monthly summary
    expect(getByText('October 5 · Leo payday')).toBeTruthy();
    expect(getByText('Total expenses')).toBeTruthy();
    expect(getByText('Monthly summary · sum of the four paydays')).toBeTruthy();
    expect(getByText('All checks pass')).toBeTruthy();
    // Four paydays a month, each showing its income.
    expect(getAllByText('💰20k')).toHaveLength(2);
    expect(getAllByText('💰10k')).toHaveLength(2);
  });

  it('shows another payday\'s split on tap and a plain note for a normal date', async () => {
    const { getByText, queryByText } = await renderWithTheme(<Breakdown />);

    await fireEvent.press(getByText('6'));
    expect(getByText('No scheduled payday')).toBeTruthy();
    expect(queryByText('Total expenses')).toBeNull();

    await fireEvent.press(getByText('15'));
    expect(getByText('October 15 · Ann payday')).toBeTruthy();
    expect(getByText('MacBook')).toBeTruthy();
  });

  it('pages through Oct 2026 - Mar 2027 and Today returns to the first month', async () => {
    const { getByText, getAllByText, getByLabelText, queryAllByText } = await renderWithTheme(<Breakdown />);

    for (let i = 0; i < 5; i++) await fireEvent.press(getByLabelText('Next month'));
    expect(getAllByText('March 2027').length).toBeGreaterThan(0);
    await fireEvent.press(getByText('Today'));
    expect(getAllByText('October 2026').length).toBeGreaterThan(0);
    expect(queryAllByText('March 2027')).toHaveLength(0);
  });

  it('renders every category as a column and the schedule-based rows for every month', async () => {
    const { getByText, getAllByText } = await openTable(renderWithTheme(<Breakdown />));

    await waitFor(() => expect(getByText('RENT')).toBeTruthy());
    expect(getByText('SAVINGS')).toBeTruthy();
    expect(getByText('Total')).toBeTruthy();

    // Bill and income columns are schedule-based, so the same amount repeats
    // for all 12 months in the window.
    expect(getAllByText('₱ 5,000')).toHaveLength(12);
    expect(getAllByText('₱ 20,000')).toHaveLength(12);
  });

  it('shows real ledger history for a past month and the forecast for the current month', async () => {
    const { getAllByText } = await openTable(renderWithTheme(<Breakdown />));

    // SAVINGS column + Total column both show the same amount that month.
    await waitFor(() => expect(getAllByText('₱ 3,000').length).toBeGreaterThan(0));
    expect(getAllByText('₱ 4,000').length).toBeGreaterThan(0);
  });

  it('shows a dash for a linked group/excess child in a future month', async () => {
    const { getAllByText } = await openTable(renderWithTheme(<Breakdown />));

    await waitFor(() => expect(getAllByText('–').length).toBeGreaterThan(0));
  });

  it('shows an error state that can be retried', async () => {
    mockUseCategories.mockReturnValue({ ...ok, isError: true });
    const { getByText } = await openTable(renderWithTheme(<Breakdown />));

    await waitFor(() => expect(getByText(/Couldn't load/)).toBeTruthy());
  });

  // Regression: on the live project, PR #81's migration adding
  // public.fund_totals_forecast was never pushed (supabase migration list
  // --linked shows it unapplied), so the RPC 404s (PGRST202, function not
  // found) and every household hits this unconditionally - unlike Summary of
  // all, which only calls the same RPC when a goal-dated fund exists.
  it('shows an error state when the fund-totals-forecast RPC call fails', async () => {
    mockUseFundTotalsForecast.mockReturnValue({ ...ok, isError: true });
    const { getByText } = await openTable(renderWithTheme(<Breakdown />));

    await waitFor(() => expect(getByText(/Couldn't load/)).toBeTruthy());
  });
});
