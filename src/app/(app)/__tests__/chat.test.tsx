import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

// expo-router is mocked wholesale here (as in the other screen tests) - its
// real entry pulls in ESM that jest-expo's transform ignores.
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseMessages = jest.fn();
const mockUseSendMessage = jest.fn();
const mockMarkRead = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useMessages: (...args: unknown[]) => mockUseMessages(...args),
  useSendMessage: (...args: unknown[]) => mockUseSendMessage(...args),
  useMarkMessagesRead: () => mockMarkRead,
}));

import Chat from '../chat';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const members = [
  { id: 'member-1', user_id: 'user-1', display_name: 'Leo', color: '#c1552f' },
  { id: 'member-2', user_id: 'user-2', display_name: 'Ann', color: '#1f5c56' },
];
// Newest first - the screen renders an inverted list.
const messages = [
  { id: 'msg-2', household_id: 'household-1', sender_id: 'user-1', body: 'On my way', created_at: '2026-09-20T02:05:00Z' },
  { id: 'msg-1', household_id: 'household-1', sender_id: 'user-2', body: 'Paid the rent', created_at: '2026-09-20T02:00:00Z' },
];

const mockSendMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ data: member });
  mockUseHouseholdMembers.mockReturnValue({ data: members });
  mockUseMessages.mockReturnValue({ data: messages });
  mockUseSendMessage.mockReturnValue({
    mutateAsync: mockSendMutateAsync.mockResolvedValue({}),
    isPending: false,
  });
});

describe('Chat', () => {
  it("shows the thread with the partner's name on their messages only", async () => {
    const { getByText, queryByText } = await renderWithTheme(<Chat />);

    await waitFor(() => expect(getByText('Paid the rent')).toBeTruthy());
    expect(getByText('On my way')).toBeTruthy();
    // Sender name labels the partner's bubble; your own bubble doesn't repeat you.
    expect(getByText('Ann')).toBeTruthy();
    expect(queryByText('Leo')).toBeNull();
  });

  it('falls back to "Someone" for a sender who deleted their account', async () => {
    mockUseMessages.mockReturnValue({
      data: [{ id: 'msg-3', household_id: 'household-1', sender_id: null, body: 'Bye', created_at: '2026-09-20T02:00:00Z' }],
    });
    const { getByText } = await renderWithTheme(<Chat />);

    await waitFor(() => expect(getByText('Someone')).toBeTruthy());
  });

  it('sends a trimmed message and clears the composer', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<Chat />);

    const input = getByPlaceholderText('Message your household');
    await fireEvent.changeText(input, '  Groceries done  ');
    await fireEvent.press(getByText('Send'));

    await waitFor(() => expect(mockSendMutateAsync).toHaveBeenCalledWith('Groceries done'));
    expect(input.props.value).toBe('');
  });

  it('does not send a blank message', async () => {
    const { getByText, getByPlaceholderText } = await renderWithTheme(<Chat />);

    await fireEvent.changeText(getByPlaceholderText('Message your household'), '   ');
    await fireEvent.press(getByText('Send'));

    expect(mockSendMutateAsync).not.toHaveBeenCalled();
  });

  it('marks the thread read while it is focused, clearing the tab badge', async () => {
    await renderWithTheme(<Chat />);

    await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());
  });

  it('shows an empty state before the first message', async () => {
    mockUseMessages.mockReturnValue({ data: [] });
    const { getByText } = await renderWithTheme(<Chat />);

    await waitFor(() => expect(getByText(/No messages yet/)).toBeTruthy());
  });
});
