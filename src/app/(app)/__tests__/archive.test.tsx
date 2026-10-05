import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate, push: jest.fn() }) }));

const mockUseHouseholdMembership = jest.fn();
const mockUseCheckedLedgerArchive = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCheckedLedgerArchive: (...args: unknown[]) => mockUseCheckedLedgerArchive(...args),
}));

import Archive from '../archive';

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue(ok({ household_id: 'household-1' }));
});

it('lists each payday with its ticked bills, funds and total', async () => {
  mockUseCheckedLedgerArchive.mockReturnValue(
    ok([
      { id: '1', payday_date: '2026-10-15', amount: 1000, status: 'checked', manual: false, categories: { name: 'RENT', kind: 'bill' }, bill_items: { label: 'Apartment' } },
      { id: '2', payday_date: '2026-10-15', amount: 500, status: 'checked', manual: false, categories: { name: 'TAIWAN', kind: 'fund' }, bill_items: null },
      { id: '3', payday_date: '2026-10-01', amount: 250, status: 'checked', manual: true, categories: { name: 'SAVINGS', kind: 'fund' }, bill_items: null },
      { id: '4', payday_date: '2026-10-01', amount: 999, status: 'pending', manual: false, categories: { name: 'HIDDEN', kind: 'fund' }, bill_items: null },
    ]),
  );
  const { getByText, queryByText } = await renderWithTheme(<Archive />);
  await waitFor(() => expect(getByText('Apartment')).toBeTruthy());
  expect(getByText('TAIWAN')).toBeTruthy();
  expect(getByText('₱ 1,500')).toBeTruthy();
  expect(getByText('SAVINGS · extra')).toBeTruthy();
  expect(queryByText('HIDDEN')).toBeNull();
});

it('shows an empty state and goes back to Settings', async () => {
  mockUseCheckedLedgerArchive.mockReturnValue(ok([]));
  const { getByText } = await renderWithTheme(<Archive />);
  expect(getByText('Nothing ticked off yet.')).toBeTruthy();
  await fireEvent.press(getByText('‹ Settings'));
  expect(mockNavigate).toHaveBeenCalledWith('/(app)/settings');
});
