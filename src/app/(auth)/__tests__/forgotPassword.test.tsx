import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockRequestReset = jest.fn();
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ requestPasswordReset: mockRequestReset }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));

import ForgotPassword from '../forgot-password';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestReset.mockResolvedValue(undefined);
});

describe('ForgotPassword', () => {
  it('rejects an invalid email without calling the server', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<ForgotPassword />);

    await fireEvent.changeText(getByLabelText('Email'), 'nope');
    await fireEvent.press(getByText('Send reset link'));

    expect(await waitFor(() => getByText('Enter a valid email address'))).toBeTruthy();
    expect(mockRequestReset).not.toHaveBeenCalled();
  });

  it('sends the link and shows a message that does not confirm the account exists', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<ForgotPassword />);

    await fireEvent.changeText(getByLabelText('Email'), 'leo@example.com');
    await fireEvent.press(getByText('Send reset link'));

    await waitFor(() => expect(mockRequestReset).toHaveBeenCalledWith('leo@example.com'));
    expect(await waitFor(() => getByText(/If an account exists for that email/))).toBeTruthy();
  });

  it('shows a generic error when sending fails', async () => {
    mockRequestReset.mockRejectedValue(new Error('rate limit'));
    const { getByText, getByLabelText } = await renderWithTheme(<ForgotPassword />);

    await fireEvent.changeText(getByLabelText('Email'), 'leo@example.com');
    await fireEvent.press(getByText('Send reset link'));

    expect(await waitFor(() => getByText(/Could not send the reset email/))).toBeTruthy();
  });
});
