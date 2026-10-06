import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockChangePassword = jest.fn();
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ changePassword: mockChangePassword }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

import ChangePassword from '../change-password';

async function fill(r: Awaited<ReturnType<typeof renderWithTheme>>, cur: string, next: string, confirm: string) {
  await fireEvent.changeText(r.getByLabelText('Current password'), cur);
  await fireEvent.changeText(r.getByLabelText('New password'), next);
  await fireEvent.changeText(r.getByLabelText('Confirm new password'), confirm);
  // The title and the button share a label; the button comes last.
  await fireEvent.press(r.getAllByText('Change password').at(-1)!);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChangePassword.mockResolvedValue(undefined);
});

describe('ChangePassword', () => {
  it('changes the password and clears the fields', async () => {
    const r = await renderWithTheme(<ChangePassword />);
    await fill(r, 'oldpassword', 'newpassword', 'newpassword');

    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith('oldpassword', 'newpassword'));
    expect(await waitFor(() => r.getByText('Password changed.'))).toBeTruthy();
    expect(r.getByLabelText('Current password').props.value).toBe('');
  });

  it('requires the current password', async () => {
    const r = await renderWithTheme(<ChangePassword />);
    await fill(r, '', 'newpassword', 'newpassword');

    expect(await waitFor(() => r.getByText('Enter your current password'))).toBeTruthy();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('rejects a too-short new password', async () => {
    const r = await renderWithTheme(<ChangePassword />);
    await fill(r, 'oldpassword', 'short', 'short');

    expect(await waitFor(() => r.getByText('Password must be at least 8 characters'))).toBeTruthy();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('rejects a mismatched confirmation', async () => {
    const r = await renderWithTheme(<ChangePassword />);
    await fill(r, 'oldpassword', 'newpassword', 'newpasswore');

    expect(await waitFor(() => r.getByText('Passwords do not match'))).toBeTruthy();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('shows the server error', async () => {
    mockChangePassword.mockRejectedValue(new Error('Your current password is incorrect.'));
    const r = await renderWithTheme(<ChangePassword />);
    await fill(r, 'wrongpass1', 'newpassword', 'newpassword');

    expect(await waitFor(() => r.getByText('Your current password is incorrect.'))).toBeTruthy();
  });
});
