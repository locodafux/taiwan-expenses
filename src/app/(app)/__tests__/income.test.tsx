import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

const mockUseHouseholdMembership = jest.fn();
const mockUseIncomes = jest.fn();
const mockUseCreateIncome = jest.fn();
const mockUseUpdateIncome = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useIncomes: (...args: unknown[]) => mockUseIncomes(...args),
  useCreateIncome: (...args: unknown[]) => mockUseCreateIncome(...args),
  useUpdateIncome: (...args: unknown[]) => mockUseUpdateIncome(...args),
}));

import IncomeManagement from '../income';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const incomes = [
  {
    id: 'inc-1',
    label: '5th payday',
    amount: 30000,
    recurring_day: 5,
    active: true,
    household_members: { display_name: 'Leo', color: '#c1552f' },
  },
];

const mockCreateMutateAsync = jest.fn();
const mockUpdateMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ data: member });
  mockUseIncomes.mockReturnValue({ data: incomes });
  mockUseCreateIncome.mockReturnValue({
    mutateAsync: mockCreateMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUseUpdateIncome.mockReturnValue({
    mutateAsync: mockUpdateMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
});

describe('IncomeManagement', () => {
  it('renders incomes with the combined monthly total', async () => {
    const { getByText, getAllByText } = await renderWithTheme(<IncomeManagement />);

    await waitFor(() => expect(getByText('5th payday')).toBeTruthy());
    expect(getByText(/Leo · recurring on the 5th/)).toBeTruthy();
    expect(getAllByText('₱ 30,000')).toHaveLength(2);
    expect(getByText('Combined monthly income')).toBeTruthy();
  });

  it('shows an empty state when there are no incomes yet', async () => {
    mockUseIncomes.mockReturnValue({ data: [] });
    const { getByText } = await renderWithTheme(<IncomeManagement />);

    await waitFor(() => expect(getByText('No incomes yet.')).toBeTruthy());
  });

  it('adds a new income', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<IncomeManagement />);

    await fireEvent.press(getByText('Add'));
    await fireEvent.changeText(getByPlaceholderText('e.g. 5th payday'), '20th payday');
    await fireEvent.changeText(getByPlaceholderText('₱0'), '15000');
    await fireEvent.press(getByText('20th'));
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        member_id: 'member-1',
        label: '20th payday',
        amount: 15000,
        recurring_day: 20,
      }),
    );
  });

  it('edits an existing income', async () => {
    const { getByText, getByDisplayValue } = await renderWithTheme(<IncomeManagement />);

    await fireEvent.press(await waitFor(() => getByText('5th payday')));
    const amountInput = getByDisplayValue('30000');
    await fireEvent.changeText(amountInput, '32000');
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        id: 'inc-1',
        label: '5th payday',
        amount: 32000,
        recurring_day: 5,
      }),
    );
  });

  it('deactivates an income', async () => {
    const { getByText } = await renderWithTheme(<IncomeManagement />);

    await fireEvent.press(await waitFor(() => getByText('5th payday')));
    await fireEvent.press(getByText('Deactivate this income'));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledWith({ id: 'inc-1', active: false }));
  });
});
