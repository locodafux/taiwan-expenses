import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockStart = jest.fn();
const mockReset = jest.fn();
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ startRecoverySession: mockStart, resetPassword: mockReset }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

let mockUrl: string | null = null;
jest.mock('expo-linking', () => ({ useLinkingURL: () => mockUrl }));

import ResetPassword from '../reset-password';

const GOOD = 'taiwanfundplanner://reset-password#access_token=acc&refresh_token=ref&type=recovery';

beforeEach(() => {
  jest.clearAllMocks();
  mockUrl = GOOD;
  mockStart.mockResolvedValue(undefined);
  mockReset.mockResolvedValue(undefined);
});

describe('ResetPassword', () => {
  it('starts the recovery session from the link, then sets the new password', async () => {
    const r = await renderWithTheme(<ResetPassword />);

    await fireEvent.changeText(await waitFor(() => r.getByLabelText('New password')), 'newpassword');
    await fireEvent.changeText(r.getByLabelText('Confirm new password'), 'newpassword');
    await fireEvent.press(r.getByText('Set new password'));

    expect(mockStart).toHaveBeenCalledWith('acc', 'ref');
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('newpassword'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('validates the new password and confirmation', async () => {
    const r = await renderWithTheme(<ResetPassword />);

    await fireEvent.changeText(await waitFor(() => r.getByLabelText('New password')), 'newpassword');
    await fireEvent.changeText(r.getByLabelText('Confirm new password'), 'different1');
    await fireEvent.press(r.getByText('Set new password'));

    expect(await waitFor(() => r.getByText('Passwords do not match'))).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('offers a new link when the link is expired', async () => {
    mockUrl = 'taiwanfundplanner://reset-password#error=access_denied&error_code=otp_expired';
    const r = await renderWithTheme(<ResetPassword />);

    expect(await waitFor(() => r.getByText(/expired or was already used/))).toBeTruthy();
    expect(mockStart).not.toHaveBeenCalled();
    await fireEvent.press(r.getByText('Request a new link'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('treats a rejected session as an expired link', async () => {
    mockStart.mockRejectedValue(new Error('bad token'));
    const r = await renderWithTheme(<ResetPassword />);

    expect(await waitFor(() => r.getByText(/expired or was already used/))).toBeTruthy();
  });

  it('shows the invalid state when opened without a link', async () => {
    mockUrl = 'taiwanfundplanner://reset-password';
    const r = await renderWithTheme(<ResetPassword />);

    expect(await waitFor(() => r.getByText('Request a new link'))).toBeTruthy();
  });
});
