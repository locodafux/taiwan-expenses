import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryMonthPercents = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseIncomes = jest.fn();
const mockUseMonthlyLedgerTotals = jest.fn();
const mockUseFundTotalsForecast = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryMonthPercents: (...args: unknown[]) => mockUseCategoryMonthPercents(...args),
  useHouseholdBillItems: (...args: unknown[]) => mockUseHouseholdBillItems(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  useMonthlyLedgerTotals: (...args: unknown[]) => mockUseMonthlyLedgerTotals(...args),
  useFundTotalsForecast: (...args: unknown[]) => mockUseFundTotalsForecast(...args),
}));

import Breakdown from '../breakdown';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
// Tests that need a real past month move "today" to Dec 15 2026.
const pastMonth = '2026-11';

const categories = [
  { id: 'cat-rent', kind: 'bill', start_month: '2026-10-01', end_month: null, name: 'RENT', color: '#c0392b', rule: null, sort_order: 0 },
  { id: 'cat-savings', kind: 'fund', start_month: '2026-10-01', end_month: null, name: 'SAVINGS', color: '#3b6fa0', rule: { type: 'remainder', percent: 100 }, sort_order: 1 },
  {
    id: 'cat-excess-kid',
    kind: 'fund', start_month: '2026-10-01', end_month: null,
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
  // Default "today" is the real Sep 29 2026, before the app's October start.
  jest.useFakeTimers({ now: new Date(2026, 8, 29), advanceTimers: true });
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ ...ok, data: member });
  mockUseCategories.mockReturnValue({ ...ok, data: categories });
  mockUseCategoryMonthPercents.mockReturnValue({ ...ok, data: [] });
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
  await fireEvent.press(utils.getByText('Month chart'));
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

  it('lists every category in the legend and shows the selected month\'s amounts, with no Total', async () => {
    const { getAllByText, getByText, queryByText } = await openTable(renderWithTheme(<Breakdown />));

    // Legend + detail panel each name every category; Oct 2026 is selected on open.
    await waitFor(() => expect(getAllByText('RENT')).toHaveLength(2));
    expect(getAllByText('SAVINGS')).toHaveLength(2);
    expect(getByText('October 2026')).toBeTruthy();
    expect(getByText('₱ 5,000')).toBeTruthy();
    expect(queryByText('Total')).toBeNull();
    expect(queryByText('Income')).toBeNull();
    expect(queryByText('₱ 20,000')).toBeNull();
  });

  it('shows real ledger history for a past month and the forecast for the current month', async () => {
    jest.setSystemTime(new Date(2026, 11, 15));
    const { getByText, getAllByText, getByLabelText } = await openTable(renderWithTheme(<Breakdown />));

    // Opens on the current month (Dec), which is projected.
    await waitFor(() => expect(getByText('December 2026')).toBeTruthy());
    expect(getAllByText('₱ 2,000')).toHaveLength(2);
    await fireEvent.press(getByLabelText('Nov 26'));
    expect(getByText('November 2026')).toBeTruthy();
    expect(getByText('₱ 3,000')).toBeTruthy();
  });

  it('shows a linked child its share of the parent\'s projected month and the parent what is left', async () => {
    const { getAllByText, queryByText } = await openTable(renderWithTheme(<Breakdown />));

    // Oct 2026: SAVINGS pool 4,000 -> child 50% = 2,000, parent keeps 2,000.
    await waitFor(() => expect(getAllByText('₱ 2,000')).toHaveLength(2));
    expect(queryByText('–')).toBeNull();
  });

  it("uses a child's percentage for that month instead of its default", async () => {
    mockUseCategoryMonthPercents.mockReturnValue({
      ...ok,
      data: [{ category_id: 'cat-excess-kid', month: '2026-10-01', percent: 25 }],
    });
    const { getByText } = await openTable(renderWithTheme(<Breakdown />));

    // Oct 2026: pool 4,000 at 25% (not the default 50%) -> child 1,000, parent keeps 3,000.
    await waitFor(() => expect(getByText('₱ 1,000')).toBeTruthy());
    expect(getByText('₱ 3,000')).toBeTruthy();
  });

  it('gives a 0% month to the parent entirely', async () => {
    mockUseCategoryMonthPercents.mockReturnValue({
      ...ok,
      data: [{ category_id: 'cat-excess-kid', month: '2026-10-01', percent: 0 }],
    });
    const { getByText, queryByText } = await openTable(renderWithTheme(<Breakdown />));

    await waitFor(() => expect(getByText('₱ 4,000')).toBeTruthy());
    expect(queryByText('₱ 2,000')).toBeNull();
  });

  it('caps a linked child at its goal and hands the rest back to the parent', async () => {
    mockUseCategories.mockReturnValue({
      ...ok,
      data: categories.map((c) =>
        c.id === 'cat-excess-kid'
          ? { ...c, rule: { type: 'group_child', parent_id: 'cat-savings', percent: 50, goal: { target_amount: 2500 } } }
          : c,
      ),
    });
    mockUseMonthlyLedgerTotals.mockReturnValue({ ...ok, data: {} });
    mockUseFundTotalsForecast.mockReturnValue({
      ...ok,
      data: [
        { category_id: 'cat-savings', month_index: 1, amount: 4000 },
        { category_id: 'cat-savings', month_index: 2, amount: 4000 },
      ],
    });
    const { getByText, getByLabelText } = await openTable(renderWithTheme(<Breakdown />));

    // Oct: child 2,000 (room 2,500 -> 500 left). Nov: child capped at 500, parent 3,500.
    await fireEvent.press(getByLabelText('Nov 26'));
    expect(getByText('₱ 500')).toBeTruthy();
    expect(getByText('₱ 3,500')).toBeTruthy();
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

  // The app starts in October 2026 (captain's call): even on the real
  // Sep 29 2026, the table opens on October and cannot page earlier.
  it('never lists or pages to a month before October 2026, even when today is in September', async () => {
    jest.setSystemTime(new Date(2026, 8, 29));
    const { getByText, queryByText, getByLabelText } = await openTable(renderWithTheme(<Breakdown />));

    await waitFor(() => expect(getByText('Oct 26 – Sep 27')).toBeTruthy());
    expect(mockUseMonthlyLedgerTotals).toHaveBeenLastCalledWith('household-1', '2026-10');
    await fireEvent.press(getByLabelText('Earlier months'));
    expect(getByText('Oct 26 – Sep 27')).toBeTruthy();
    expect(queryByText(/Sep 26/)).toBeNull();
  });
});
