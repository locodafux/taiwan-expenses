import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockPush = jest.fn();
const mockDismissTo = jest.fn();
const mockParams = { id: 'cat-fund' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, dismissTo: mockDismissTo }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseCategories = jest.fn();
const mockUseCategoryHistory = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseBillItems = jest.fn();
const mockUseAddManualContribution = jest.fn();
const mockUseCreateBillItem = jest.fn();
const mockUseDeleteCategory = jest.fn();
const mockUseUpdateCategory = jest.fn();
const mockUseUpdateBillItem = jest.fn();
const mockUseDeleteBillItem = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryHistory: (...args: unknown[]) => mockUseCategoryHistory(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useBillItems: (...args: unknown[]) => mockUseBillItems(...args),
  useAddManualContribution: (...args: unknown[]) => mockUseAddManualContribution(...args),
  useCreateBillItem: (...args: unknown[]) => mockUseCreateBillItem(...args),
  useDeleteCategory: (...args: unknown[]) => mockUseDeleteCategory(...args),
  useUpdateCategory: (...args: unknown[]) => mockUseUpdateCategory(...args),
  useUpdateBillItem: (...args: unknown[]) => mockUseUpdateBillItem(...args),
  useDeleteBillItem: (...args: unknown[]) => mockUseDeleteBillItem(...args),
}));

import CategoryDetail from '../[id]';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const fundCategory = {
  id: 'cat-fund',
  name: 'Taiwan fund',
  kind: 'fund',
  color: '#1f5c56',
  rule: { type: 'goal', target_amount: 50000 },
};
const billCategory = {
  id: 'cat-bill',
  name: 'Rent',
  kind: 'bill',
  color: '#c1552f',
  rule: null,
};
const history = [
  { id: 'h1', amount: 5000, payday_date: '2026-09-05', checked_by: 'user-1' },
  { id: 'h2', amount: 3000, payday_date: '2026-08-05', checked_by: null },
];
const members = [{ id: 'member-1', user_id: 'user-1', display_name: 'Leo' }];

const mockAddContributionMutateAsync = jest.fn();
const mockCreateBillItemMutateAsync = jest.fn();
const mockDeleteCategoryMutateAsync = jest.fn();
const mockUpdateCategoryMutateAsync = jest.fn();
const mockUpdateBillItemMutateAsync = jest.fn();
const mockDeleteBillItemMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.id = 'cat-fund';
  mockUseHouseholdMembership.mockReturnValue({ data: member });
  mockUseCategories.mockReturnValue({ data: [fundCategory, billCategory] });
  mockUseCategoryHistory.mockReturnValue({ data: history });
  mockUseHouseholdMembers.mockReturnValue({ data: members });
  mockUseBillItems.mockReturnValue({ data: [] });
  mockUseAddManualContribution.mockReturnValue({
    mutateAsync: mockAddContributionMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUseCreateBillItem.mockReturnValue({
    mutateAsync: mockCreateBillItemMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUseDeleteCategory.mockReturnValue({
    mutateAsync: mockDeleteCategoryMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUseUpdateCategory.mockReturnValue({
    mutateAsync: mockUpdateCategoryMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUseUpdateBillItem.mockReturnValue({
    mutateAsync: mockUpdateBillItemMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
  mockUseDeleteBillItem.mockReturnValue({
    mutateAsync: mockDeleteBillItemMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
});

describe('CategoryDetail', () => {
  it('renders a fund category balance, goal progress and history with realistic data', async () => {
    const { getByText, getAllByText } = await renderWithTheme(<CategoryDetail />);

    // The name appears in the header and again on each history row, which for
    // a fund (no bill item) is labelled with the category itself.
    await waitFor(() => expect(getAllByText('Taiwan fund').length).toBeGreaterThan(0));
    expect(getByText('₱ 8,000')).toBeTruthy();
    expect(getByText(/of ₱ 50,000 goal/)).toBeTruthy();
    expect(getByText(/^Leo ·/)).toBeTruthy();
    expect(getByText(/^Manual entry ·/)).toBeTruthy();
  });

  it('shows an empty state when there is no history yet', async () => {
    mockUseCategoryHistory.mockReturnValue({ data: [] });
    const { getByText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('Nothing checked off yet.')).toBeTruthy());
  });

  it('adds a manual contribution to a fund category', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('+ Add contribution')));
    await fireEvent.changeText(getByPlaceholderText('₱0'), '2500');
    await fireEvent.press(getByText('Save'));

    await waitFor(() => expect(mockAddContributionMutateAsync).toHaveBeenCalledWith({ categoryId: 'cat-fund', amount: 2500 }));
  });

  it('renders a bill category with its line items and lets you add one', async () => {
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [{ id: 'bi-1', label: 'Base rent', amount: 1500, recurring_day: 5, end_date: null }],
    });

    const { getByText, getByPlaceholderText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('Base rent')).toBeTruthy());
    expect(getByText('Line items')).toBeTruthy();

    await fireEvent.press(getByText('+ Add item'));
    await fireEvent.changeText(getByPlaceholderText('e.g. Internet'), 'Internet');
    await fireEvent.changeText(getByPlaceholderText('₱0'), '900');
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockCreateBillItemMutateAsync).toHaveBeenCalledWith({
        label: 'Internet',
        amount: 900,
        recurring_day: 5,
        end_date: null,
      }),
    );
  });

  it('records a loan term as an end date and shows the payments left', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21));
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [{ id: 'bi-1', label: 'Car loan', amount: 8000, recurring_day: 5, end_date: '2026-12-05' }],
    });

    const { getByText, getByPlaceholderText, getByLabelText } = await renderWithTheme(<CategoryDetail />);

    // Oct, Nov, Dec still to pay.
    await waitFor(() => expect(getByText(/3 payments left · until Dec 2026/)).toBeTruthy());

    await fireEvent.press(getByText('+ Add item'));
    await fireEvent.changeText(getByPlaceholderText('e.g. Internet'), 'Phone');
    await fireEvent.changeText(getByPlaceholderText('₱0'), '1200');
    await fireEvent.press(getByText('Never ends · set a last month'));
    expect(getByText('Sep 2026')).toBeTruthy();
    await fireEvent.press(getByLabelText('Next month'));
    await fireEvent.press(getByLabelText('Next month'));
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockCreateBillItemMutateAsync).toHaveBeenCalledWith({
        label: 'Phone',
        amount: 1200,
        recurring_day: 5,
        end_date: '2026-11-05',
      }),
    );
    jest.useRealTimers();
  });

  it("rejects an end month whose payment date has already passed", async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21));
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({ data: [] });

    const { getByText, getByPlaceholderText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('+ Add item')));
    await fireEvent.changeText(getByPlaceholderText('e.g. Internet'), 'Phone');
    await fireEvent.changeText(getByPlaceholderText('₱0'), '1200');
    await fireEvent.press(getByText('Never ends · set a last month'));
    await fireEvent.press(getByText('Save'));

    await waitFor(() => expect(getByText("That month's payment date has already passed")).toBeTruthy());
    expect(mockCreateBillItemMutateAsync).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('pre-selects the end month when editing and can clear it', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21));
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [{ id: 'bi-1', label: 'Car loan', amount: 8000, recurring_day: 5, end_date: '2026-12-05' }],
    });

    const { getByText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Car loan')));
    expect(getByText('Dec 2026')).toBeTruthy();
    await fireEvent.press(getByText('Clear'));
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateBillItemMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bi-1', end_date: null }),
      ),
    );
    jest.useRealTimers();
  });

  it('scopes a bill category\'s headline total to the current month, not all-time', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 14));
    mockParams.id = 'cat-bill';
    mockUseCategoryHistory.mockReturnValue({
      data: [
        { id: 'h1', amount: 5000, payday_date: '2026-09-05', checked_by: 'user-1' },
        { id: 'h2', amount: 3000, payday_date: '2026-08-05', checked_by: null },
      ],
    });

    const { getByText, getAllByText } = await renderWithTheme(<CategoryDetail />);

    // Headline total plus the September history row both read ₱ 5,000.
    await waitFor(() => expect(getAllByText('₱ 5,000').length).toBe(2));
    expect(getByText('paid this month')).toBeTruthy();
    jest.useRealTimers();
  });

  it('navigates back to the category list', async () => {
    const { getByText } = await renderWithTheme(<CategoryDetail />);
    await fireEvent.press(await waitFor(() => getByText('‹ Back')));
    expect(mockDismissTo).toHaveBeenCalledWith('/(app)/categories');
  });

  it('opens the delete confirmation sheet with real bill/entry/total stats', async () => {
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [
        { id: 'bi-1', label: 'Base rent', amount: 1500, recurring_day: 5, end_date: null },
        { id: 'bi-2', label: 'Utilities', amount: 500, recurring_day: 10, end_date: null },
        { id: 'bi-3', label: 'Water', amount: 300, recurring_day: 15, end_date: null },
      ],
    });

    const { getByText } = await renderWithTheme(<CategoryDetail />);
    await fireEvent.press(await waitFor(() => getByText('Delete category')));

    expect(getByText('Delete Category & History')).toBeTruthy();
    expect(getByText('3')).toBeTruthy(); // Bills
    expect(getByText(String(history.length))).toBeTruthy(); // Entries
    expect(getByText('₱ 8,000')).toBeTruthy(); // Logged (5000 + 3000)
  });

  it('deletes the category after confirming in the sheet, and navigates back', async () => {
    const { getByText } = await renderWithTheme(<CategoryDetail />);
    await fireEvent.press(await waitFor(() => getByText('Delete category')));
    await fireEvent.press(getByText('Delete Category & History'));

    await waitFor(() => expect(mockDeleteCategoryMutateAsync).toHaveBeenCalledWith('cat-fund'));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(app)/categories'));
  });

  it('does not delete when the sheet is cancelled', async () => {
    const { getByText, queryByText } = await renderWithTheme(<CategoryDetail />);
    await fireEvent.press(await waitFor(() => getByText('Delete category')));
    await fireEvent.press(getByText('Cancel'));

    expect(mockDeleteCategoryMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(queryByText('Delete Category & History')).toBeNull());
  });

  it('shows a simple no-history state for a category with nothing logged', async () => {
    mockUseCategoryHistory.mockReturnValue({ data: [] });
    mockUseBillItems.mockReturnValue({ data: [] });

    const { getByText } = await renderWithTheme(<CategoryDetail />);
    await fireEvent.press(await waitFor(() => getByText('Delete category')));

    expect(getByText(/nothing else to lose/)).toBeTruthy();
  });

  it('groups history by month, naming the specific bill item paid, by whom and when', async () => {
    mockParams.id = 'cat-bill';
    mockUseCategoryHistory.mockReturnValue({
      data: [
        {
          id: 'h1',
          amount: 1500,
          payday_date: '2026-09-05',
          checked_at: '2026-09-05T02:00:00.000Z',
          checked_by: 'user-1',
          bill_items: { label: 'Base rent' },
        },
        {
          id: 'h2',
          amount: 900,
          payday_date: '2026-09-15',
          checked_at: '2026-09-15T02:00:00.000Z',
          checked_by: 'user-1',
          bill_items: { label: 'Internet' },
        },
        {
          id: 'h3',
          amount: 1500,
          payday_date: '2026-08-05',
          checked_at: '2026-08-05T02:00:00.000Z',
          checked_by: null,
          bill_items: { label: 'Base rent' },
        },
      ],
    });

    const { getByText, getAllByText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('September 2026')).toBeTruthy());
    expect(getByText('August 2026')).toBeTruthy();
    // September's subtotal (1500 + 900), not the all-time 3,900 - and it also
    // matches the "paid this month" headline, hence two matches.
    expect(getAllByText('₱ 2,400').length).toBe(2);
    expect(getByText('Internet')).toBeTruthy();
    expect(getAllByText('Base rent').length).toBe(2);
    expect(getByText(/^Leo · Sep 5/)).toBeTruthy();
    expect(getByText(/^Manual entry · Aug 5/)).toBeTruthy();
  });

  it('keeps only the last 12 months of history', async () => {
    mockUseCategoryHistory.mockReturnValue({
      data: Array.from({ length: 18 }, (_, i) => {
        const month = 12 - (i % 12);
        const year = 2026 - Math.floor(i / 12);
        const date = `${year}-${String(month).padStart(2, '0')}-05`;
        return {
          id: `h${i}`,
          amount: 1000,
          payday_date: date,
          checked_at: `${date}T02:00:00.000Z`,
          checked_by: 'user-1',
          bill_items: null,
        };
      }),
    });

    const { getByText, queryByText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('December 2026')).toBeTruthy());
    expect(getByText('January 2026')).toBeTruthy();
    // 13th month back and older are dropped.
    expect(queryByText('December 2025')).toBeNull();
    // The headline balance still sums every entry, not just the shown 12.
    expect(getByText('₱ 18,000')).toBeTruthy();
  });

  it('edits a fund category name and goal target, keeping the rest of its rule', async () => {
    const { getByText, getByDisplayValue } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Edit')));
    await fireEvent.changeText(getByDisplayValue('Taiwan fund'), 'Japan fund');
    await fireEvent.changeText(getByDisplayValue('50000'), '60000');
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateCategoryMutateAsync).toHaveBeenCalledWith({
        id: 'cat-fund',
        name: 'Japan fund',
        color: '#1f5c56',
        rule: { type: 'goal', target_amount: 60000, target_date: null, one_time: false },
      }),
    );
  });

  it('edits a remainder fund\'s share of what is left', async () => {
    mockUseCategories.mockReturnValue({
      data: [{ ...fundCategory, name: 'Savings', rule: { type: 'remainder', percent: 20 } }],
    });
    const { getByText, getByDisplayValue } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Edit')));
    await fireEvent.changeText(getByDisplayValue('20'), '0');
    await fireEvent.press(getByText('Save'));
    expect(await waitFor(() => getByText('Enter a share between 1 and 100'))).toBeTruthy();

    await fireEvent.changeText(getByDisplayValue('0'), '35');
    await fireEvent.press(getByText('Save'));
    await waitFor(() =>
      expect(mockUpdateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ rule: { type: 'remainder', percent: 35 } }),
      ),
    );
  });

  it('marks a goal as a one-time expense from the edit form', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Edit')));
    await fireEvent(getByLabelText('One-time expense'), 'valueChange', true);
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ rule: { type: 'goal', target_amount: 50000, target_date: null, one_time: true } }),
      ),
    );
  });

  it('sets a goal deadline month from the edit form', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21));
    const { getByText, getByLabelText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Edit')));
    await fireEvent.press(getByText('No deadline · set a month'));
    expect(getByText('Oct 2026')).toBeTruthy();
    // Past months aren't offered.
    await fireEvent.press(getByLabelText('Previous month'));
    expect(getByText('Oct 2026')).toBeTruthy();
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ rule: { type: 'goal', target_amount: 50000, target_date: '2026-10-01', one_time: false } }),
      ),
    );
    jest.useRealTimers();
  });

  it('changes and clears an existing goal deadline', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21));
    mockUseCategories.mockReturnValue({
      data: [{ ...fundCategory, rule: { type: 'goal', target_amount: 80000, target_date: '2027-03-01' } }],
    });
    const { getByText, getByLabelText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Edit')));
    expect(getByText('Mar 2027')).toBeTruthy();
    await fireEvent.press(getByLabelText('Next month'));
    await fireEvent.press(getByText('Save'));
    await waitFor(() =>
      expect(mockUpdateCategoryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ rule: { type: 'goal', target_amount: 80000, target_date: '2027-04-01', one_time: false } }),
      ),
    );

    await fireEvent.press(getByText('Edit'));
    await fireEvent.press(getByText('Clear'));
    await fireEvent.press(getByText('Save'));
    await waitFor(() =>
      expect(mockUpdateCategoryMutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({ rule: { type: 'goal', target_amount: 80000, target_date: null, one_time: false } }),
      ),
    );
    jest.useRealTimers();
  });

  it('edits a bill line item, flagging a moved recurring day', async () => {
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [{ id: 'bi-1', label: 'Base rent', amount: 1500, recurring_day: 5, end_date: null }],
    });
    const { getByText, getByDisplayValue } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Base rent')));
    await fireEvent.changeText(getByDisplayValue('1500'), '1600');
    await fireEvent.changeText(getByDisplayValue('5'), '10');
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateBillItemMutateAsync).toHaveBeenCalledWith({
        id: 'bi-1',
        dayChanged: true,
        label: 'Base rent',
        amount: 1600,
        recurring_day: 10,
        end_date: null,
      }),
    );
    expect(mockCreateBillItemMutateAsync).not.toHaveBeenCalled();
  });

  it('sets a payment term on an existing loan from the edit form', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21));
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [{ id: 'bi-1', label: 'Car loan', amount: 8000, recurring_day: 5, end_date: '2026-12-05' }],
    });
    const { getByText, getByLabelText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Car loan')));
    for (let i = 0; i < 3; i++) await fireEvent.press(getByLabelText('Next month'));
    expect(getByText('Mar 2027')).toBeTruthy();
    await fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(mockUpdateBillItemMutateAsync).toHaveBeenCalledWith({
        id: 'bi-1',
        dayChanged: true,
        label: 'Car loan',
        amount: 8000,
        recurring_day: 5,
        end_date: '2027-03-05',
      }),
    );
    jest.useRealTimers();
  });

  it('deletes a bill line item after confirming', async () => {
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [{ id: 'bi-1', label: 'Base rent', amount: 1500, recurring_day: 5, end_date: null }],
    });
    const { getByText } = await renderWithTheme(<CategoryDetail />);

    await fireEvent.press(await waitFor(() => getByText('Base rent')));
    await fireEvent.press(getByText('Delete item'));
    expect(getByText('Delete Base rent?')).toBeTruthy();
    await fireEvent.press(getByText('Delete'));

    await waitFor(() => expect(mockDeleteBillItemMutateAsync).toHaveBeenCalledWith('bi-1'));
  });

  it('hides line items that have already retired', async () => {
    mockParams.id = 'cat-bill';
    mockUseBillItems.mockReturnValue({
      data: [
        { id: 'bi-1', label: 'Base rent', amount: 1500, recurring_day: 5, end_date: null },
        { id: 'bi-2', label: 'Old loan', amount: 500, recurring_day: 10, end_date: '2020-01-01' },
      ],
    });
    const { getByText, queryByText } = await renderWithTheme(<CategoryDetail />);

    await waitFor(() => expect(getByText('Base rent')).toBeTruthy());
    expect(queryByText('Old loan')).toBeNull();
  });
});
