import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

import { ErrorBoundary } from '../ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <Text>fine</Text>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders children when there is no error', async () => {
    await renderWithTheme(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('fine')).toBeTruthy();
  });

  it('renders the fallback instead of crashing when a child throws', async () => {
    await renderWithTheme(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.queryByText('fine')).toBeNull();
  });

  it('resets the boundary when Retry is pressed, re-rendering children', async () => {
    let shouldThrow = true;
    function Toggle() {
      return <Bomb shouldThrow={shouldThrow} />;
    }

    await renderWithTheme(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();

    shouldThrow = false;
    await fireEvent.press(screen.getByText('Retry'));

    expect(screen.getByText('fine')).toBeTruthy();
  });
});
