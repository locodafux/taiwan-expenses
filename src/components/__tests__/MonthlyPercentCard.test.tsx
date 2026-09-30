import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockUseCategoryMonthPercents = jest.fn();
const mockMutateAsync = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useCategoryMonthPercents: (...args: unknown[]) => mockUseCategoryMonthPercents(...args),
  useSetMonthPercent: () => ({ mutateAsync: mockMutateAsync }),
}));

import { MonthlyPercentCard } from '../MonthlyPercentCard';

const child = {
  id: 'kid',
  name: 'Kid',
  kind: 'fund',
  start_month: '2026-10-01',
  end_month: null,
  rule: { type: 'group_child', parent_id: 'p', percent: 30 },
} as never;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 10), advanceTimers: true });
  jest.clearAllMocks();
  mockMutateAsync.mockResolvedValue(undefined);
  mockUseCategoryMonthPercents.mockReturnValue({
    data: [
      { category_id: 'kid', month: '2026-11-01', percent: 0 },
      { category_id: 'other', month: '2026-12-01', percent: 90 },
    ],
  });
});
afterEach(() => jest.useRealTimers());

describe('MonthlyPercentCard', () => {
  it('shows this child\'s overrides (0 included) and the default as the placeholder', async () => {
    const { getByLabelText } = await renderWithTheme(
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} />,
    );
    expect(getByLabelText('Percentage for 2026-11').props.value).toBe('0');
    expect(getByLabelText('Percentage for 2026-12').props.value).toBe('');
    expect(getByLabelText('Percentage for 2026-12').props.placeholder).toBe('30');
  });

  it('saves a month, allowing 0, and clears an override when emptied', async () => {
    const { getByLabelText } = await renderWithTheme(
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} />,
    );
    const dec = getByLabelText('Percentage for 2026-12');
    await fireEvent.changeText(dec, '0');
    await fireEvent(dec, 'endEditing');
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ categoryId: 'kid', month: '2026-12-01', percent: 0 }),
    );

    const nov = getByLabelText('Percentage for 2026-11');
    await fireEvent.changeText(nov, '');
    await fireEvent(nov, 'endEditing');
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ categoryId: 'kid', month: '2026-11-01', percent: null }),
    );
  });

  it('rejects a percentage above 100 and shows the database error', async () => {
    const { getByLabelText, getByText } = await renderWithTheme(
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} />,
    );
    const jan = getByLabelText('Percentage for 2027-01');
    await fireEvent.changeText(jan, '101');
    await fireEvent(jan, 'endEditing');
    expect(getByText('Enter a percentage between 0 and 100')).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();

    mockMutateAsync.mockRejectedValueOnce(new Error('group child percentages cannot exceed 100 in Jan 2027 (got 120)'));
    await fireEvent.changeText(jan, '90');
    await fireEvent(jan, 'endEditing');
    await waitFor(() => expect(getByText(/cannot exceed 100 in Jan 2027/)).toBeTruthy());
  });

  it('stops at the category\'s last month', async () => {
    const { queryByLabelText } = await renderWithTheme(
      <MonthlyPercentCard category={{ ...(child as object), end_month: '2026-11-01' } as never} householdId="h" defaultPercent={30} />,
    );
    expect(queryByLabelText('Percentage for 2026-11')).toBeTruthy();
    expect(queryByLabelText('Percentage for 2026-12')).toBeNull();
  });
});
