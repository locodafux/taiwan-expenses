import { Dimensions } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryMonthPercents = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseIncomes = jest.fn();
const mockUseMonthlyLedgerTotals = jest.fn();
const mockUseFundTotalsForecast = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...a: unknown[]) => mockUseHouseholdMembership(...a),
  useCategories: (...a: unknown[]) => mockUseCategories(...a),
  useCategoryMonthPercents: (...a: unknown[]) => mockUseCategoryMonthPercents(...a),
  useHouseholdBillItems: (...a: unknown[]) => mockUseHouseholdBillItems(...a),
  useIncomes: (...a: unknown[]) => mockUseIncomes(...a),
  useMonthlyLedgerTotals: (...a: unknown[]) => mockUseMonthlyLedgerTotals(...a),
  useFundTotalsForecast: (...a: unknown[]) => mockUseFundTotalsForecast(...a),
}));

import { FullNumbersTable } from '../FullNumbersTable';

const ok = { isLoading: false, isError: false, refetch: jest.fn() };
const base = { kind: 'bill', end_month: null, color: null, rule: null };
// Rent runs all year; Loan has a last payment date (Nov 2026); Trip is a fund that only runs in November.
const categories = [
  { ...base, id: 'rent', name: 'RENT', start_month: '2026-10-01', sort_order: 0 },
  { ...base, id: 'loan', name: 'LOAN', start_month: '2026-10-01', sort_order: 1 },
  { ...base, id: 'trip', name: 'TRIP', kind: 'fund', start_month: '2026-11-01', end_month: '2026-11-01', sort_order: 2 },
];
const bills = [
  { category_id: 'rent', amount: 5000, recurring_day: 5, end_date: null },
  { category_id: 'loan', amount: 2000, recurring_day: 5, end_date: '2026-11-05' },
];

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 8, 29), advanceTimers: true });
  mockUseHouseholdMembership.mockReturnValue({ ...ok, data: { household_id: 'h1' } });
  mockUseCategories.mockReturnValue({ ...ok, data: categories });
  mockUseCategoryMonthPercents.mockReturnValue({ ...ok, data: [] });
  mockUseHouseholdBillItems.mockReturnValue({ ...ok, data: bills });
  mockUseIncomes.mockReturnValue({ ...ok, data: [{ amount: 20000, recurring_day: 5, active: true }] });
  mockUseMonthlyLedgerTotals.mockReturnValue({ ...ok, data: {} });
  mockUseFundTotalsForecast.mockReturnValue({
    ...ok,
    data: [{ category_id: 'trip', month_index: 2, amount: 15000 }],
  });
});

describe('FullNumbersTable (Yearly Cashflow)', () => {
  it('opens on the current year: Oct-Dec 2026 with income, expenses, debt, money staying, the live funds and a year Total row', async () => {
    const { getByText, getAllByText, queryByText, queryByTestId } = await renderWithTheme(<FullNumbersTable />);

    expect(getByText('Yearly Cashflow')).toBeTruthy();
    expect(getByText('2026 · amounts in pesos')).toBeTruthy();
    expect(queryByTestId('cashflow-graph')).toBeNull(); // the graph moved to the Fund summary
    for (const h of ['Month', "Total '26"]) expect(getByText(h)).toBeTruthy();
    for (const h of ['Income', 'Expenses', 'Debt', 'Money staying', 'TRIP']) expect(getByText(h)).toBeTruthy();
    for (const m of ["Oct '26", "Nov '26", "Dec '26"]) expect(getByText(m)).toBeTruthy();
    expect(queryByText("Jan '27")).toBeNull();
    expect(queryByText("Sep '29")).toBeNull();
    expect(getAllByText('20,000')).toHaveLength(3);
    expect(getByText('60,000')).toBeTruthy(); // income total: 20k x 3
    expect(getAllByText('–').length).toBeGreaterThan(0); // zero cells read as a dash, not ₱ 0
    expect(getByText('4,000')).toBeTruthy(); // debt total: loan ends after Nov (Oct + Nov)
    expect(getAllByText('15,000')).toHaveLength(5); // rent total (5k x 3), plus the Nov cell + total for both Money staying and TRIP: the fund only shows in its own month
  });

  it('the year arrows reach the later years of the 36-month window and stop at its ends', async () => {
    const { getByText, queryByText, getByLabelText } = await renderWithTheme(<FullNumbersTable />);

    expect(getByLabelText('Previous year').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(getByLabelText('Next year'));
    expect(getByText('2027 · amounts in pesos')).toBeTruthy();
    expect(getByText("Jan '27")).toBeTruthy();
    expect(getByText("Dec '27")).toBeTruthy();
    expect(queryByText("Dec '26")).toBeNull();
    expect(getByText('240,000')).toBeTruthy(); // 2027 income total: 20k x 12
    expect(getByText("Total '27")).toBeTruthy();

    await fireEvent.press(getByLabelText('Next year'));
    await fireEvent.press(getByLabelText('Next year'));
    expect(getByText('2029 · amounts in pesos')).toBeTruthy();
    expect(getByText("Sep '29")).toBeTruthy(); // the window ends in September
    expect(queryByText("Oct '29")).toBeNull();
    expect(getByLabelText('Next year').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(getByLabelText('Previous year'));
    expect(getByText('2028 · amounts in pesos')).toBeTruthy();
  });

  it('upright it keeps the sideways-scroll table and offers the landscape view; landscape drops the button and shows the same figures', async () => {
    const onExpand = jest.fn();
    const upright = await renderWithTheme(<FullNumbersTable onExpand={onExpand} />);
    await fireEvent.press(upright.getByText('See every column at once (landscape)'));
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(upright.getByText('Yearly Cashflow')).toBeTruthy();
    await upright.unmount();

    const spy = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 844, height: 390, scale: 2, fontScale: 1 });
    try {
      const { getByText, getAllByText, queryByText, getByLabelText } = await renderWithTheme(<FullNumbersTable onExpand={onExpand} />);
      expect(queryByText('See every column at once (landscape)')).toBeNull();
      expect(getByText('Yearly Cashflow · 2026 · pesos')).toBeTruthy();
      for (const h of ['Month', 'Income', 'Expenses', 'Debt', 'Money staying', 'TRIP', "Total '26"]) expect(getByText(h)).toBeTruthy();
      expect(getByText("Oct '26")).toBeTruthy();
      expect(getByText('60,000')).toBeTruthy(); // income total
      expect(getAllByText('15,000')).toHaveLength(5);
      await fireEvent.press(getByLabelText('Next year'));
      expect(getByText('Yearly Cashflow · 2027 · pesos')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
