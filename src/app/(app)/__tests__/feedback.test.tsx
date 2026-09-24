import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

const mockUseFeedback = jest.fn();
const mockUseSubmitFeedback = jest.fn();
const mockSubmitMutateAsync = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: () => ({ data: { household_id: 'household-1', user_id: 'user-1' } }),
  useHouseholdMembers: () => ({
    data: [
      { user_id: 'user-1', display_name: 'Leo' },
      { user_id: 'user-2', display_name: 'Alex' },
    ],
  }),
  useFeedback: (...args: unknown[]) => mockUseFeedback(...args),
  useSubmitFeedback: (...args: unknown[]) => mockUseSubmitFeedback(...args),
}));

import Feedback from '../feedback';

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFeedback.mockReturnValue({ data: [] });
  mockUseSubmitFeedback.mockReturnValue({
    mutateAsync: mockSubmitMutateAsync.mockResolvedValue(undefined),
    isPending: false,
  });
});

describe('Feedback', () => {
  it("lists the household's feedback with who sent it and its status", async () => {
    mockUseFeedback.mockReturnValue({
      data: [
        { id: 'f1', user_id: 'user-2', description: 'Split savings evenly', status: 'done', created_at: '2026-09-20T02:00:00Z' },
        { id: 'f2', user_id: 'user-1', description: 'Dark mode', status: 'planned', created_at: '2026-09-19T02:00:00Z' },
        { id: 'f3', user_id: null, description: 'Old idea', status: 'open', created_at: '2026-09-18T02:00:00Z' },
      ],
    });
    const { getByText } = await renderWithTheme(<Feedback />);

    expect(getByText('Split savings evenly')).toBeTruthy();
    expect(getByText(/^Alex · /)).toBeTruthy();
    expect(getByText(/^You · /)).toBeTruthy();
    expect(getByText(/^Former member · /)).toBeTruthy();
    expect(getByText('Done')).toBeTruthy();
    expect(getByText('Planned')).toBeTruthy();
    expect(getByText('Open')).toBeTruthy();
    expect(mockUseFeedback).toHaveBeenCalledWith('household-1');
  });

  it('sends feedback for the household and confirms success', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<Feedback />);

    await fireEvent.changeText(getByLabelText('Feedback'), '  Checklist froze  ');
    await fireEvent.press(getByText('Send feedback'));

    await waitFor(() => expect(mockSubmitMutateAsync).toHaveBeenCalledWith('Checklist froze'));
    expect(mockUseSubmitFeedback).toHaveBeenCalledWith('household-1');
    expect(await waitFor(() => getByText('Thanks - your feedback was sent.'))).toBeTruthy();
    expect(getByLabelText('Feedback').props.value).toBe('');
  });

  it('dismisses the confirmation after a few seconds', async () => {
    jest.useFakeTimers();
    try {
      const { getByText, getByLabelText, queryByText } = await renderWithTheme(<Feedback />);

      await fireEvent.changeText(getByLabelText('Feedback'), 'Checklist froze');
      await fireEvent.press(getByText('Send feedback'));
      await waitFor(() => getByText('Thanks - your feedback was sent.'));

      await act(() => jest.advanceTimersByTime(4000));

      expect(queryByText('Thanks - your feedback was sent.')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('requires some text before sending', async () => {
    const { getByText } = await renderWithTheme(<Feedback />);

    await fireEvent.press(getByText('Send feedback'));

    expect(await waitFor(() => getByText('Write something first.'))).toBeTruthy();
    expect(mockSubmitMutateAsync).not.toHaveBeenCalled();
  });

  it('shows an error and keeps the draft when sending fails', async () => {
    mockSubmitMutateAsync.mockRejectedValue(new Error('Network request failed'));
    const { getByText, getByLabelText } = await renderWithTheme(<Feedback />);

    await fireEvent.changeText(getByLabelText('Feedback'), 'Checklist froze');
    await fireEvent.press(getByText('Send feedback'));

    expect(await waitFor(() => getByText('Network request failed'))).toBeTruthy();
    expect(getByLabelText('Feedback').props.value).toBe('Checklist froze');
  });
});
