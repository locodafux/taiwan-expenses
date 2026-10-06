import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockSignIn = jest.fn();
const mockUpdateUser = jest.fn();
const mockResetForEmail = jest.fn();
const mockSetSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { email: 'leo@example.com' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      resetPasswordForEmail: (...a: unknown[]) => mockResetForEmail(...a),
      setSession: (...a: unknown[]) => mockSetSession(...a),
    },
  },
}));
jest.mock('@/lib/notifications', () => ({ unregisterPushToken: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (p: string) => `taiwanfundplanner://${p}` }));

import { AuthProvider, useAuth } from '../auth';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

async function setup() {
  const hook = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.session).not.toBeNull());
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockResetForEmail.mockResolvedValue({ error: null });
  mockSetSession.mockResolvedValue({ error: null });
});

describe('changePassword', () => {
  it('re-verifies the current password before updating', async () => {
    const { result } = await setup();

    await act(() => result.current.changePassword('oldpassword', 'newpassword'));

    expect(mockSignIn).toHaveBeenCalledWith({ email: 'leo@example.com', password: 'oldpassword' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    expect(mockSignIn.mock.invocationCallOrder[0]).toBeLessThan(mockUpdateUser.mock.invocationCallOrder[0]);
  });

  it('does not update when the current password is wrong', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const { result } = await setup();

    await expect(act(() => result.current.changePassword('wrong', 'newpassword'))).rejects.toThrow(
      'Your current password is incorrect.',
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('requests the reset email with the app deep link as redirect', async () => {
    const { result } = await setup();

    await act(() => result.current.requestPasswordReset('  leo@example.com '));

    expect(mockResetForEmail).toHaveBeenCalledWith('leo@example.com', {
      redirectTo: 'taiwanfundplanner://reset-password',
    });
  });

  it('starts the recovery session and sets the new password', async () => {
    const { result } = await setup();

    await act(() => result.current.startRecoverySession('acc', 'ref'));
    await act(() => result.current.resetPassword('newpassword'));

    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'acc', refresh_token: 'ref' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword' });
  });

  it('surfaces a rejected recovery session', async () => {
    mockSetSession.mockResolvedValue({ error: new Error('expired') });
    const { result } = await setup();

    await expect(act(() => result.current.startRecoverySession('a', 'r'))).rejects.toThrow('expired');
  });
});
