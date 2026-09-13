import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockSignOut = jest.fn();
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseCreateInvite = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useCreateInvite: (...args: unknown[]) => mockUseCreateInvite(...args),
}));

import Settings from '../settings';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const members = [
  { id: 'member-1', display_name: 'Leo', color: '#c1552f' },
  { id: 'member-2', display_name: 'Alex', color: '#1f5c56' },
];

const mockCreateInviteMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ data: member });
  mockUseHouseholdMembers.mockReturnValue({ data: members });
  mockUseCreateInvite.mockReturnValue({
    mutateAsync: mockCreateInviteMutateAsync.mockResolvedValue({ code: 'abc123def456' }),
    isPending: false,
  });
});

describe('Settings', () => {
  it('renders household members and defaults to the warm theme description', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    await waitFor(() => expect(getByText('Leo')).toBeTruthy());
    expect(getByText('Alex')).toBeTruthy();
    expect(getByText(/Direction B — terracotta/)).toBeTruthy();
  });

  it('switches theme when a different option is pressed', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('Playful')));

    await waitFor(() => expect(getByText(/Direction C — bold violet-to-pink/)).toBeTruthy());
  });

  it('generates an invite code', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('Generate invite code')));

    expect(await waitFor(() => getByText('abc123def456'))).toBeTruthy();
    expect(getByText('Generate a new code')).toBeTruthy();
  });

  it('shows an error when invite generation fails', async () => {
    mockCreateInviteMutateAsync.mockRejectedValue(new Error('Could not generate invite code'));
    const { getByText } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('Generate invite code')));

    expect(await waitFor(() => getByText('Could not generate invite code'))).toBeTruthy();
  });

  it('signs out', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('Sign out')));

    expect(mockSignOut).toHaveBeenCalled();
  });
});
