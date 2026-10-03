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
    rule: { type: 'group_child', parent_id: 'p', percent: 30 },
} as never;

const siblings = [
  { id: 'other', name: 'Other fund', start_month: '2026-10-01', percent: 20 },
  { id: 'late', name: 'Late fund', start_month: '2027-03-01', percent: 100 },
];

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
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} parentName="Excess" siblings={siblings} />,
    );
    expect(getByLabelText('Percentage for 2026-11').props.value).toBe('0');
    expect(getByLabelText('Percentage for 2026-12').props.value).toBe('');
    expect(getByLabelText('Percentage for 2026-12').props.placeholder).toBe('30');
  });

  it('saves a month, allowing 0, and clears an override when emptied', async () => {
    const { getByLabelText } = await renderWithTheme(
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} parentName="Excess" siblings={siblings} />,
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
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} parentName="Excess" siblings={siblings} />,
    );
    const jan = getByLabelText('Percentage for 2027-01');
    await fireEvent.changeText(jan, '101');
    await fireEvent(jan, 'endEditing');
    expect(getByText('Enter a percentage between 0 and 100')).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();

    mockMutateAsync.mockRejectedValueOnce(new Error('group child percentages cannot exceed 100 in Jan 2027 (got 120)'));
    await fireEvent.changeText(jan, '50');
    await fireEvent(jan, 'endEditing');
    await waitFor(() => expect(getByText(/cannot exceed 100 in Jan 2027/)).toBeTruthy());
  });

  it('shows what is left per month and leaves out a sibling that has not started', async () => {
    const { getByText, getAllByText } = await renderWithTheme(
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} parentName="Excess" siblings={siblings} />,
    );
    // Oct: this 30 + Other 20 -> 50 left; Nov override 0 -> 80 left; Dec: Other overrides to 90 -> -20 over.
    expect(getAllByText(/50% left - stays in Excess · Late fund starts Mar 2027/).length).toBeGreaterThan(0);
    expect(getAllByText(/80% left - stays in Excess/)).toHaveLength(1);
    expect(getByText(/20% over - Other fund 90%/)).toBeTruthy();
  });

  it('refuses a save that would pass 100 before asking the server, with the message on that row', async () => {
    const { getByLabelText, getByText } = await renderWithTheme(
      <MonthlyPercentCard category={child} householdId="h" defaultPercent={30} parentName="Excess" siblings={siblings} />,
    );
    const dec = getByLabelText('Percentage for 2026-12');
    await fireEvent.changeText(dec, '50');
    await fireEvent(dec, 'endEditing');
    expect(getByText('Only 10% fits here - the other funds in the group already take 90% that month.')).toBeTruthy();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('keeps ranges open-ended: a far month is listed whatever any end_month says', async () => {
    const { queryByLabelText } = await renderWithTheme(
      <MonthlyPercentCard category={{ ...(child as object), end_month: '2026-11-01' } as never} householdId="h" defaultPercent={30} parentName="Excess" siblings={siblings} />,
    );
    expect(queryByLabelText('Percentage for 2026-12')).toBeTruthy();
  });

  const withDeadline = (target_date: string | null, start_month = '2026-10-01') =>
    ({ ...(child as object), start_month, rule: { type: 'group_child', parent_id: 'p', percent: 30, goal: { target_amount: 1000, target_date } } }) as never;
  const renderWith = (category: never) =>
    renderWithTheme(<MonthlyPercentCard category={category} householdId="h" defaultPercent={30} parentName="Excess" siblings={siblings} />);

  it('stops at the Complete by month, inclusive, and keeps an override beyond it untouched', async () => {
    mockUseCategoryMonthPercents.mockReturnValue({ data: [{ category_id: 'kid', month: '2027-01-01', percent: 5 }] });
    const { queryByLabelText } = await renderWith(withDeadline('2026-12-01'));
    expect(queryByLabelText('Percentage for 2026-12')).toBeTruthy();
    expect(queryByLabelText('Percentage for 2027-01')).toBeNull();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('lists the usual 12 months when no Complete by is set', async () => {
    const { queryByLabelText } = await renderWith(withDeadline(null));
    expect(queryByLabelText('Percentage for 2027-09')).toBeTruthy();
  });

  it('shows no month rows, with a note, when Complete by is before the first month', async () => {
    const { queryByLabelText, getByText } = await renderWith(withDeadline('2026-08-01'));
    expect(queryByLabelText('Percentage for 2026-10')).toBeNull();
    expect(getByText(/No months left/)).toBeTruthy();
  });
});
