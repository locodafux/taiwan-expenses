import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
const mockSignInWithGoogle = jest.fn();

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    signUp: mockSignUp,
    signIn: mockSignIn,
    signInWithGoogle: mockSignInWithGoogle,
  }),
}));

import Onboarding from '../index';

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue(undefined);
  mockSignIn.mockResolvedValue(undefined);
  mockSignInWithGoogle.mockResolvedValue(undefined);
});

describe('Onboarding', () => {
  it('renders the welcome step with the three entry points', async () => {
    const { getByText } = await renderWithTheme(<Onboarding />);

    expect(getByText('Sign up')).toBeTruthy();
    expect(getByText('Join with an invite code')).toBeTruthy();
    expect(getByText('I already have an account')).toBeTruthy();
  });

  it('validates required fields before creating an account', async () => {
    const { getByText } = await renderWithTheme(<Onboarding />);

    await fireEvent.press(getByText('Sign up'));
    await fireEvent.press(getByText('Create account'));

    expect(await waitFor(() => getByText('Name is required'))).toBeTruthy();
    expect(getByText('Email is required')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('creates a household on sign up with valid data', async () => {
    const { getByText, getByPlaceholderText, getByLabelText } = await renderWithTheme(<Onboarding />);

    await fireEvent.press(getByText('Sign up'));
    await fireEvent.changeText(getByPlaceholderText('e.g. Leo'), 'Leo');
    await fireEvent.changeText(getByPlaceholderText('leo@email.com'), 'leo@email.com');
    await fireEvent.changeText(getByLabelText('Password'), 'supersecret');
    await fireEvent.changeText(getByPlaceholderText('Our household'), 'The Timkangs');
    await fireEvent.press(getByText('Create account'));

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith('leo@email.com', 'supersecret', {
        displayName: 'Leo',
        householdName: 'The Timkangs',
      }),
    );
  });

  it('requires an invite code to join a household', async () => {
    const { getByText, getByPlaceholderText, getByLabelText } = await renderWithTheme(<Onboarding />);

    await fireEvent.press(getByText('Join with an invite code'));
    await fireEvent.changeText(getByPlaceholderText('e.g. Leo'), 'Alex');
    await fireEvent.changeText(getByPlaceholderText('leo@email.com'), 'alex@email.com');
    await fireEvent.changeText(getByLabelText('Password'), 'supersecret');
    await fireEvent.press(getByText('Join household'));

    expect(await waitFor(() => getByText('Invite code is required'))).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();

    await fireEvent.changeText(getByPlaceholderText('e.g. bcea6b01dbd4'), 'bcea6b01dbd4');
    await fireEvent.press(getByText('Join household'));

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith('alex@email.com', 'supersecret', {
        displayName: 'Alex',
        inviteCode: 'bcea6b01dbd4',
      }),
    );
  });

  it('signs in an existing user', async () => {
    const { getAllByText, getByText, getByPlaceholderText, getByLabelText } = await renderWithTheme(
      <Onboarding />,
    );

    await fireEvent.press(getByText('I already have an account'));
    await fireEvent.changeText(getByPlaceholderText('leo@email.com'), 'leo@email.com');
    await fireEvent.changeText(getByLabelText('Password'), 'supersecret');
    const [, submitButton] = getAllByText('Sign in');
    await fireEvent.press(submitButton);

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('leo@email.com', 'supersecret'));
  });

  it('surfaces a sign-in error', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'));
    const { getAllByText, getByText, getByPlaceholderText, getByLabelText } = await renderWithTheme(
      <Onboarding />,
    );

    await fireEvent.press(getByText('I already have an account'));
    await fireEvent.changeText(getByPlaceholderText('leo@email.com'), 'leo@email.com');
    await fireEvent.changeText(getByLabelText('Password'), 'supersecret');
    const [, submitButton] = getAllByText('Sign in');
    await fireEvent.press(submitButton);

    expect(await waitFor(() => getByText('Invalid login credentials'))).toBeTruthy();
  });

  it('continues with Google', async () => {
    const { getByText } = await renderWithTheme(<Onboarding />);

    await fireEvent.press(getByText('Sign up'));
    await fireEvent.press(getByText('Continue with Google'));

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled());
  });

  it('shows the min-length hint upfront and toggles password visibility', async () => {
    const { getByText, getByLabelText } = await renderWithTheme(<Onboarding />);

    await fireEvent.press(getByText('Sign up'));
    expect(getByText('Min 8 characters')).toBeTruthy();

    const passwordInput = getByLabelText('Password');
    expect(passwordInput.props.secureTextEntry).toBe(true);

    await fireEvent.press(getByText('Show'));
    expect(passwordInput.props.secureTextEntry).toBe(false);

    await fireEvent.press(getByText('Hide'));
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('goes back to the welcome step', async () => {
    const { getByText } = await renderWithTheme(<Onboarding />);

    await fireEvent.press(getByText('Sign up'));
    await fireEvent.press(getByText('‹ Back'));

    expect(getByText('Join with an invite code')).toBeTruthy();
  });
});
