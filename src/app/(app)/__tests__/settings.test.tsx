import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockSignOut = jest.fn();
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

const mockUseHouseholdMembership = jest.fn();
const mockUseHousehold = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseCreateInvite = jest.fn();
const mockUseUpdateHouseholdName = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useHousehold: (...args: unknown[]) => mockUseHousehold(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useCreateInvite: (...args: unknown[]) => mockUseCreateInvite(...args),
  useUpdateHouseholdName: (...args: unknown[]) => mockUseUpdateHouseholdName(...args),
}));

import Settings from '../settings';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1' };
const members = [
  { id: 'member-1', display_name: 'Leo', color: '#c1552f' },
  { id: 'member-2', display_name: 'Alex', color: '#1f5c56' },
];

const mockCreateInviteMutateAsync = jest.fn();
const mockUpdateHouseholdNameMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseHouseholdMembership.mockReturnValue({ data: member });
  mockUseHousehold.mockReturnValue({ data: { id: 'household-1', name: 'The Smiths' } });
  mockUseHouseholdMembers.mockReturnValue({ data: members });
  mockUseCreateInvite.mockReturnValue({
    mutateAsync: mockCreateInviteMutateAsync.mockResolvedValue({ code: 'abc123def456' }),
    isPending: false,
  });
  mockUseUpdateHouseholdName.mockReturnValue({
    mutateAsync: mockUpdateHouseholdNameMutateAsync.mockResolvedValue(undefined),
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

  it('renames the household', async () => {
    const { getByText, getByDisplayValue } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('The Smiths')));
    const input = getByDisplayValue('The Smiths');
    await fireEvent.changeText(input, 'The Garcias');
    await fireEvent(input, 'submitEditing');

    await waitFor(() => expect(mockUpdateHouseholdNameMutateAsync).toHaveBeenCalledWith('The Garcias'));
  });

  it('signs out', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('Sign out')));

    expect(mockSignOut).toHaveBeenCalled();
  });
});
