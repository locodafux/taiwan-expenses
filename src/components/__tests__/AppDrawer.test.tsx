import { fireEvent } from '@testing-library/react-native';

import type { ComponentProps } from 'react';

import { renderWithTheme } from '@/test/renderWithTheme';

jest.mock('expo-router/drawer', () => ({
  DrawerContentScrollView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ session: { user: { email: 'leo@example.com' } } }) }));
jest.mock('@/lib/queries', () => ({
  useHouseholdMembership: () => ({ data: { household_id: 'h1' } }),
  useHousehold: () => ({ data: { name: 'Leo & Alex' } }),
  useUnreadMessageCount: () => ({ data: 3 }),
}));

import { AppDrawerContent } from '../AppDrawer';

describe('AppDrawerContent', () => {
  it('shows household + email, the six destinations, and navigates on press', async () => {
    const navigate = jest.fn();
    const props = {
      state: { index: 1, routes: [{ key: 'a', name: 'index' }, { key: 'b', name: 'checklist' }] },
      navigation: { navigate },
    } as unknown as ComponentProps<typeof AppDrawerContent>;
    const { getByText } = await renderWithTheme(<AppDrawerContent {...props} />);
    expect(getByText('Leo & Alex')).toBeTruthy();
    expect(getByText('leo@example.com')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    for (const label of ['Dashboard', 'Checklist', 'Categories', 'Full numbers', 'Chat', 'Settings']) expect(getByText(label)).toBeTruthy();
    await fireEvent.press(getByText('Chat'));
    expect(navigate).toHaveBeenCalledWith('chat');
  });
});
