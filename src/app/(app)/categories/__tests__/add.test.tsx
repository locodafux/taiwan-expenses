import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockCreateCategoryMutateAsync = jest.fn();
const mockUseCreateCategory = jest.fn();
const mockCreateBillItemMutateAsync = jest.fn();
const mockUseCreateBillItem = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCreateCategory: (...args: unknown[]) => mockUseCreateCategory(...args),
  useCreateBillItem: (...args: unknown[]) => mockUseCreateBillItem(...args),
}));

import AddCategorySheet from '../add';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ data: member });
  mockUseCreateCategory.mockReturnValue({
    mutateAsync: mockCreateCategoryMutateAsync.mockResolvedValue({ id: 'new-cat' }),
    isPending: false,
  });
  mockUseCreateBillItem.mockReturnValue({
    mutateAsync: mockCreateBillItemMutateAsync.mockResolvedValue({ id: 'new-bill' }),
    isPending: false,
  });
});

describe('AddCategorySheet', () => {
  it('requires a name before saving', async () => {
    const { getByText } = await renderWithTheme(<AddCategorySheet />);

    await fireEvent.press(getByText('Add category'));

    expect(await waitFor(() => getByText('Name is required'))).toBeTruthy();
    expect(mockCreateCategoryMutateAsync).not.toHaveBeenCalled();
  });

  it('creates a fund category with a percentage rule when no target is set', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<AddCategorySheet />);

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Vacation fund');
    await fireEvent.press(getByText('Add category'));

    await waitFor(() =>
      expect(mockCreateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Vacation fund',
          kind: 'fund',
          rule: expect.objectContaining({ type: 'remainder', percent: 20 }),
        }),
      ),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('saves the share of what is left that the user picks, and hides it for a goal', async () => {
    const { getByText, getByPlaceholderText, getByDisplayValue, queryByDisplayValue } =
      await renderWithTheme(<AddCategorySheet />);

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Savings');
    await fireEvent.changeText(getByDisplayValue('20'), '30');
    await fireEvent.press(getByText('Add category'));

    await waitFor(() =>
      expect(mockCreateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ rule: expect.objectContaining({ type: 'remainder', percent: 30 }) }),
      ),
    );

    await fireEvent.changeText(getByPlaceholderText('Leave blank for no limit'), '80000');
    expect(queryByDisplayValue('30')).toBeNull();
  });

  it.each(['0', '101', 'abc'])('rejects a share of %p', async (input) => {
    const { getByText, getByPlaceholderText, getByDisplayValue } = await renderWithTheme(
      <AddCategorySheet />,
    );

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Savings');
    await fireEvent.changeText(getByDisplayValue('20'), input);
    await fireEvent.press(getByText('Add category'));

    expect(await waitFor(() => getByText('Enter a share between 1 and 100'))).toBeTruthy();
    expect(mockCreateCategoryMutateAsync).not.toHaveBeenCalled();
  });

  // Amounts belong to the bill items inside a category, not the category itself,
  // so adding a bill category asks for no amount and creates no bill item.
  it('creates a bill category without asking for an amount or creating a bill item', async () => {
    const { getByText, getByPlaceholderText, queryByPlaceholderText, queryByText } =
      await renderWithTheme(<AddCategorySheet />);

    await fireEvent.press(getByText('Bill (recurring expense)'));
    expect(queryByPlaceholderText('₱0')).toBeNull();
    expect(queryByText('Amount')).toBeNull();

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Internet');
    await fireEvent.press(getByText('Add category'));

    await waitFor(() =>
      expect(mockCreateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Internet', kind: 'bill', rule: undefined }),
      ),
    );
    expect(mockCreateBillItemMutateAsync).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it('sets a deadline month on a goal fund, starting from next month', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21));
    const { getByText, getByPlaceholderText, getByLabelText, queryByText } = await renderWithTheme(
      <AddCategorySheet />,
    );

    // No target, no goal, no deadline field.
    expect(queryByText('No deadline · set a month')).toBeNull();
    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Taiwan fund');
    await fireEvent.changeText(getByPlaceholderText('Leave blank for no limit'), '80000');
    await fireEvent.press(getByText('No deadline · set a month'));
    expect(getByText('Oct 2026')).toBeTruthy();
    await fireEvent.press(getByLabelText('Next month'));
    await fireEvent.press(getByText('Add category'));

    await waitFor(() =>
      expect(mockCreateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          rule: expect.objectContaining({ type: 'goal', target_amount: 80000, target_date: '2026-11-01' }),
        }),
      ),
    );
    jest.useRealTimers();
  });

  it('saves a goal without a deadline when the month is cleared', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<AddCategorySheet />);

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Taiwan fund');
    await fireEvent.changeText(getByPlaceholderText('Leave blank for no limit'), '80000');
    await fireEvent.press(getByText('No deadline · set a month'));
    await fireEvent.press(getByText('Clear'));
    await fireEvent.press(getByText('Add category'));

    await waitFor(() => expect(mockCreateCategoryMutateAsync).toHaveBeenCalled());
    expect(mockCreateCategoryMutateAsync.mock.calls[0][0].rule.target_date).toBeUndefined();
  });

  // Bug report 2026-09-21: "80,000" used to parse to NaN -> saved as a goal
  // with target 0, which the brand-new (₱0) category had already "reached".
  it('reads a comma-formatted target as the full amount', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<AddCategorySheet />);

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Taiwan fund');
    await fireEvent.changeText(getByPlaceholderText('Leave blank for no limit'), '₱80,000');
    await fireEvent.press(getByText('Add category'));

    await waitFor(() =>
      expect(mockCreateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ rule: expect.objectContaining({ type: 'goal', target_amount: 80000 }) }),
      ),
    );
  });

  it.each(['0', '80k', 'abc'])('rejects a target of %p instead of saving a ₱0 goal', async (input) => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<AddCategorySheet />);

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Taiwan fund');
    await fireEvent.changeText(getByPlaceholderText('Leave blank for no limit'), input);
    await fireEvent.press(getByText('Add category'));

    expect(await waitFor(() => getByText('Enter a valid target amount'))).toBeTruthy();
    expect(mockCreateCategoryMutateAsync).not.toHaveBeenCalled();
  });

  it('shows an error message when saving fails', async () => {
    mockCreateCategoryMutateAsync.mockRejectedValue(new Error('Could not save category'));
    const { getByText, getByPlaceholderText } = await renderWithTheme(<AddCategorySheet />);

    await fireEvent.changeText(getByPlaceholderText('e.g. New laptop fund'), 'Vacation fund');
    await fireEvent.press(getByText('Add category'));

    expect(await waitFor(() => getByText('Could not save category'))).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('cancels back without saving', async () => {
    const { getByText } = await renderWithTheme(<AddCategorySheet />);
    await fireEvent.press(getByText('Cancel'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockCreateCategoryMutateAsync).not.toHaveBeenCalled();
  });
});
