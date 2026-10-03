import { renderHook } from '@testing-library/react-native';

import { useMonthlyCells } from '../monthlyCells';

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryMonthPercents = jest.fn();
const mockUseHouseholdBillItems = jest.fn();
const mockUseMonthlyLedgerTotals = jest.fn();
const mockUseFundTotalsForecast = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...a: unknown[]) => mockUseHouseholdMembership(...a),
  useCategories: (...a: unknown[]) => mockUseCategories(...a),
  useCategoryMonthPercents: (...a: unknown[]) => mockUseCategoryMonthPercents(...a),
  useHouseholdBillItems: (...a: unknown[]) => mockUseHouseholdBillItems(...a),
  useMonthlyLedgerTotals: (...a: unknown[]) => mockUseMonthlyLedgerTotals(...a),
  useFundTotalsForecast: (...a: unknown[]) => mockUseFundTotalsForecast(...a),
}));

const ok = { isLoading: false, isError: false, refetch: jest.fn() };
const fund = { kind: 'fund', start_month: '2026-10-01', end_month: null, color: null };
// Pinatubo: ₱15,000 goal, 100% in Oct and 40% in Nov, inside a pool of 11,846 (Oct) / 15,546 (Nov).
const categories = [
  { ...fund, id: 'pool', name: 'Excess', sort_order: 0, rule: { type: 'remainder', percent: 100 } },
  {
    ...fund,
    id: 'pina',
    name: 'Pinatubo',
    sort_order: 1,
    rule: { type: 'group_child', parent_id: 'pool', percent: 0, goal: { target_amount: 15000, target_date: '2026-11-01' } },
  },
];
const months = ['2026-10', '2026-11'];

function setup(ledger: Record<string, Record<string, number>>) {
  jest.useFakeTimers({ now: new Date(2026, 9, 31), advanceTimers: true });
  mockUseHouseholdMembership.mockReturnValue({ ...ok, data: { household_id: 'h1' } });
  mockUseCategories.mockReturnValue({ ...ok, data: categories });
  mockUseCategoryMonthPercents.mockReturnValue({
    ...ok,
    data: [
      { category_id: 'pina', month: '2026-10-01', percent: 100 },
      { category_id: 'pina', month: '2026-11-01', percent: 40 },
    ],
  });
  mockUseHouseholdBillItems.mockReturnValue({ ...ok, data: [] });
  mockUseMonthlyLedgerTotals.mockReturnValue({ ...ok, data: ledger });
  mockUseFundTotalsForecast.mockReturnValue({
    ...ok,
    data: [
      { category_id: 'pool', month_index: 1, amount: 11846 },
      { category_id: 'pool', month_index: 2, amount: 15546 },
    ],
  });
}

describe('useMonthlyCells linked-fund goal room', () => {
  it('keeps the goal room for November when October is ticked off', async () => {
    setup({ '2026-10': { pina: 11846 } });
    const { result } = await renderHook(() => useMonthlyCells(months));
    expect(result.current.cellValue(categories[1] as never, '2026-10')).toBe(11846);
    expect(result.current.cellValue(categories[1] as never, '2026-11')).toBe(3154);
  });

  it('still stops at the goal when earlier months already filled it', async () => {
    setup({ '2026-09': { pina: 15000 } });
    const { result } = await renderHook(() => useMonthlyCells(months));
    expect(result.current.cellValue(categories[1] as never, '2026-11')).toBe(0);
  });
});
