import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { ThemeProvider, useTheme } from '../ThemeProvider';

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <Text testID="theme-name">{theme}</Text>
      <Pressable testID="switch-to-playful" onPress={() => setTheme('playful')}>
        <Text>switch</Text>
      </Pressable>
    </>
  );
}

describe('ThemeProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to the warm theme', async () => {
    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(getByTestId('theme-name').props.children).toBe('warm'));
  });

  it('switches theme and persists the choice', async () => {
    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(getByTestId('theme-name').props.children).toBe('warm'));
    fireEvent.press(getByTestId('switch-to-playful'));

    await waitFor(() => expect(getByTestId('theme-name').props.children).toBe('playful'));
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('taiwan-fund-planner:theme')).toBe('playful');
    });
  });

  it('restores a previously persisted theme on mount', async () => {
    await AsyncStorage.setItem('taiwan-fund-planner:theme', 'original');

    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(getByTestId('theme-name').props.children).toBe('original'));
  });
});
