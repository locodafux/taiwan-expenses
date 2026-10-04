import { renderWithTheme } from '@/test/renderWithTheme';

const mockLock = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
  lockAsync: (...a: unknown[]) => mockLock(...a),
}));
jest.mock('expo-router', () => ({
  // Run the focus effect once on mount, like a focused screen.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));
jest.mock('@/components/FullNumbersTable', () => ({ FullNumbersTable: () => null }));

import CashflowScreen from '../cashflow';

describe('Cashflow screen', () => {
  it('turns landscape while open and back to portrait when left', async () => {
    const { unmount } = await renderWithTheme(<CashflowScreen />);
    expect(mockLock).toHaveBeenLastCalledWith('LANDSCAPE');
    await unmount();
    expect(mockLock).toHaveBeenLastCalledWith('PORTRAIT_UP');
  });
});
