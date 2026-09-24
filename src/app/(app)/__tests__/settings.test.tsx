import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { CHANGELOG } from '@/lib/changelog';
import { renderWithTheme } from '@/test/renderWithTheme';

const mockSignOut = jest.fn();
const mockDeleteAccount = jest.fn();
const mockChangePassword = jest.fn();
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { user: { email: 'leo@example.com' } },
    signOut: mockSignOut,
    deleteAccount: mockDeleteAccount,
    changePassword: mockChangePassword,
  }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSetStringAsync = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args) }));

const mockUseHouseholdMembership = jest.fn();
const mockUseHousehold = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseCreateInvite = jest.fn();
const mockUseUpdateHouseholdName = jest.fn();
const mockUseUpdateDisplayName = jest.fn();
const mockSetNotificationsMutate = jest.fn();
const mockSetAutoCheckMutate = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: (...args: unknown[]) => mockUseHouseholdMembership(...args),
  useHousehold: (...args: unknown[]) => mockUseHousehold(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useCreateInvite: (...args: unknown[]) => mockUseCreateInvite(...args),
  useUpdateHouseholdName: (...args: unknown[]) => mockUseUpdateHouseholdName(...args),
  useUpdateDisplayName: (...args: unknown[]) => mockUseUpdateDisplayName(...args),
  useSetNotificationsEnabled: () => ({ mutate: mockSetNotificationsMutate, isPending: false }),
  useSetAutoCheckPastPaydays: () => ({ mutate: mockSetAutoCheckMutate, isPending: false }),
}));

import Settings from '../settings';

const member = { id: 'member-1', household_id: 'household-1', user_id: 'user-1', display_name: 'Leo' };
const members = [
  { id: 'member-1', display_name: 'Leo', color: '#c1552f' },
  { id: 'member-2', display_name: 'Alex', color: '#1f5c56' },
];

const mockCreateInviteMutateAsync = jest.fn();
const mockUpdateHouseholdNameMutateAsync = jest.fn();
const mockUpdateDisplayNameMutateAsync = jest.fn();

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
  mockUseUpdateDisplayName.mockReturnValue({
    mutateAsync: mockUpdateDisplayNameMutateAsync.mockResolvedValue(undefined),
    isPending: false,
  });
  mockChangePassword.mockResolvedValue(undefined);
});

describe('Settings', () => {
  it('turns push notifications off with the master switch', async () => {
    const { getByLabelText } = await renderWithTheme(<Settings />);

    const toggle = getByLabelText('Push notifications');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);

    expect(mockSetNotificationsMutate).toHaveBeenCalledWith(false, expect.anything());
  });

  it('turns on auto-ticking past paydays, off by default', async () => {
    const { getByLabelText } = await renderWithTheme(<Settings />);

    const toggle = getByLabelText('Tick off past paydays automatically');
    expect(toggle.props.value).toBe(false);
    await fireEvent(toggle, 'valueChange', true);

    expect(mockSetAutoCheckMutate).toHaveBeenCalledWith(true, expect.anything());
  });

  it('renders household members and defaults to the warm theme description', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    await waitFor(() => expect(getByText('Leo')).toBeTruthy());
    expect(getByText('Alex')).toBeTruthy();
    expect(getByText(/Sunday Market — sage/)).toBeTruthy();
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

  it('keeps Delete account hidden until the danger zone is expanded', async () => {
    const { getByText, queryByText } = await renderWithTheme(<Settings />);
    await waitFor(() => getByText('Danger zone'));
    expect(queryByText('Delete account')).toBeNull();
    await fireEvent.press(getByText('Danger zone'));
    expect(getByText('Delete account')).toBeTruthy();
  });

  it('opens income management from the profile section', async () => {
    const { getByText } = await renderWithTheme(<Settings />);
    await fireEvent.press(await waitFor(() => getByText('Income')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/income');
  });

  it("opens the full What's new list from the About section", async () => {
    const { getByText, queryByText } = await renderWithTheme(<Settings />);
    expect(queryByText(CHANGELOG[1].items[0])).toBeNull();
    await fireEvent.press(await waitFor(() => getByText('What’s new')));
    expect(getByText(CHANGELOG[0].items[0])).toBeTruthy();
    expect(getByText(CHANGELOG[1].items[0])).toBeTruthy();
    await fireEvent.press(getByText('Got it'));
    expect(queryByText(CHANGELOG[1].items[0])).toBeNull();
  });

  it('deletes the account after confirming, warning that it cannot be undone', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Delete account');
      confirm?.onPress?.();
    });

    const { getByText } = await renderWithTheme(<Settings />);
    await fireEvent.press(await waitFor(() => getByText('Danger zone')));
    await fireEvent.press(getByText('Delete account'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete your account?',
      expect.stringContaining('cannot be undone'),
      expect.any(Array),
    );
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());

    alertSpy.mockRestore();
  });

  it('warns a partner in the household that shared data will stay behind', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText } = await renderWithTheme(<Settings />);
    await fireEvent.press(await waitFor(() => getByText('Danger zone')));
    await fireEvent.press(getByText('Delete account'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete your account?',
      expect.stringContaining('Shared categories, bills and ledger history stay'),
      expect.any(Array),
    );

    alertSpy.mockRestore();
  });

  it('does not delete the account when the confirmation is cancelled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText } = await renderWithTheme(<Settings />);
    await fireEvent.press(await waitFor(() => getByText('Danger zone')));
    await fireEvent.press(getByText('Delete account'));

    expect(alertSpy).toHaveBeenCalled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('copies a generated invite code to the clipboard', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('Generate invite code')));
    await fireEvent.press(await waitFor(() => getByLabelText('Copy invite code')));

    expect(mockSetStringAsync).toHaveBeenCalledWith('abc123def456');
    expect(await waitFor(() => getByText('Copied ✓'))).toBeTruthy();
  });

  it('opens the Feedback screen', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    await fireEvent.press(await waitFor(() => getByText('Feedback')));

    expect(mockPush).toHaveBeenCalledWith('/(app)/feedback');
  });

  it('shows the account email read-only', async () => {
    const { getByText } = await renderWithTheme(<Settings />);

    expect(await waitFor(() => getByText('leo@example.com'))).toBeTruthy();
  });

  it('renames yourself, trimming the name', async () => {
    const { getByText, getByLabelText, queryByText } = await renderWithTheme(<Settings />);

    const input = await waitFor(() => getByLabelText('Your name'));
    expect(input.props.value).toBe('Leo');
    expect(queryByText('Save name')).toBeNull();
    await fireEvent.changeText(input, '  Leonardo ');
    await fireEvent.press(getByText('Save name'));

    await waitFor(() => expect(mockUpdateDisplayNameMutateAsync).toHaveBeenCalledWith('Leonardo'));
    expect(mockUseUpdateDisplayName).toHaveBeenCalledWith('household-1');
    expect(await waitFor(() => getByText('Name saved.'))).toBeTruthy();
  });

  it('rejects a blank name', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<Settings />);

    await fireEvent.changeText(await waitFor(() => getByLabelText('Your name')), '   ');
    await fireEvent.press(getByText('Save name'));

    expect(await waitFor(() => getByText('Name is required'))).toBeTruthy();
    expect(mockUpdateDisplayNameMutateAsync).not.toHaveBeenCalled();
  });

  it('changes the password and clears the field', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<Settings />);

    await fireEvent.changeText(await waitFor(() => getByLabelText('New password')), 'supersecret');
    await fireEvent.press(getByText('Change password'));

    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith('supersecret'));
    expect(await waitFor(() => getByText('Password changed.'))).toBeTruthy();
    expect(getByLabelText('New password').props.value).toBe('');
  });

  it('rejects a too-short password without calling the server', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<Settings />);

    await fireEvent.changeText(await waitFor(() => getByLabelText('New password')), 'short');
    await fireEvent.press(getByText('Change password'));

    expect(await waitFor(() => getByText('Password must be at least 8 characters'))).toBeTruthy();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('shows the server error when a password change fails', async () => {
    mockChangePassword.mockRejectedValue(new Error('New password should be different from the old password.'));
    const { getByText, getByLabelText } = await renderWithTheme(<Settings />);

    await fireEvent.changeText(await waitFor(() => getByLabelText('New password')), 'supersecret');
    await fireEvent.press(getByText('Change password'));

    expect(await waitFor(() => getByText('New password should be different from the old password.'))).toBeTruthy();
  });
});
