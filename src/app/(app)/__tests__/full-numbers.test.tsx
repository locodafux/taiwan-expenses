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

import FullNumbers from '../full-numbers';

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

describe('FullNumbers', () => {
  it('lays out ten months with income, expenses, debt, the live funds and a Total row', async () => {
    const { getByText, getAllByText } = await renderWithTheme(<FullNumbers />);

    for (const h of ['Month', 'Income', 'Expenses', 'Debt', 'TRIP', 'Total']) expect(getByText(h)).toBeTruthy();
    expect(getByText("Oct '26")).toBeTruthy();
    expect(getByText("Jul '27")).toBeTruthy();
    expect(getAllByText('₱ 20,000')).toHaveLength(10);
    expect(getByText('₱ 200,000')).toBeTruthy(); // income total
    expect(getByText('₱ 50,000')).toBeTruthy(); // rent total: 5k x 10
    expect(getByText('₱ 4,000')).toBeTruthy(); // debt total: loan ends after Nov (Oct + Nov)
    expect(getAllByText('₱ 15,000')).toHaveLength(2); // Nov cell + total: the fund only shows in its own month
  });
});
