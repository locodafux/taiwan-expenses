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
}));

import { AppDrawerContent } from '../AppDrawer';

describe('AppDrawerContent', () => {
  it('shows household + email and only the destinations the bottom tabs lack, and navigates on press', async () => {
    const navigate = jest.fn();
    const props = {
      state: { index: 0, routes: [{ key: 'a', name: '(tabs)' }, { key: 'b', name: 'settings' }] },
      navigation: { navigate },
    } as unknown as ComponentProps<typeof AppDrawerContent>;
    const { getByText, queryByText } = await renderWithTheme(<AppDrawerContent {...props} />);
    expect(getByText('Leo & Alex')).toBeTruthy();
    expect(getByText('leo@example.com')).toBeTruthy();
    for (const label of ['Full numbers', 'Settings']) expect(getByText(label)).toBeTruthy();
    for (const label of ['Dashboard', 'Checklist', 'Categories', 'Chat']) expect(queryByText(label)).toBeNull();
    await fireEvent.press(getByText('Settings'));
    expect(navigate).toHaveBeenCalledWith('settings');
  });
});
