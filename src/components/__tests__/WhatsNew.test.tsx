import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { CHANGELOG } from '@/lib/changelog';
import { renderWithTheme } from '@/test/renderWithTheme';

import { WhatsNew } from '../WhatsNew';

const SEEN_KEY = 'taiwan-fund-planner:whats-new-seen';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('WhatsNew', () => {
  it('shows what changed since the last entry seen, then remembers the newest as seen', async () => {
    await AsyncStorage.setItem(SEEN_KEY, CHANGELOG[1].id);
    const { getByText, queryByText } = await renderWithTheme(<WhatsNew />);

    await waitFor(() => getByText(CHANGELOG[0].items[0]));
    expect(queryByText(CHANGELOG[1].items[0])).toBeNull();

    await fireEvent.press(getByText('Got it'));
    expect(await AsyncStorage.getItem(SEEN_KEY)).toBe(CHANGELOG[0].id);
    expect(queryByText(CHANGELOG[0].items[0])).toBeNull();
  });

  it('stays hidden once the newest entry has been seen', async () => {
    await AsyncStorage.setItem(SEEN_KEY, CHANGELOG[0].id);
    const { queryByText } = await renderWithTheme(<WhatsNew />);
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(SEEN_KEY));
    await act(async () => {});
    expect(queryByText('Got it')).toBeNull();
  });

  it('shows only the latest entry on a phone that has never seen the list', async () => {
    const { getByText, queryByText } = await renderWithTheme(<WhatsNew />);
    await waitFor(() => getByText(CHANGELOG[0].items[0]));
    expect(queryByText(CHANGELOG[1].items[0])).toBeNull();
  });
});
