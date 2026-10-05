import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useToday } from '../useToday';

afterEach(() => jest.useRealTimers());

describe('useToday', () => {
  it('rolls over at midnight', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 59), advanceTimers: true });
    const { result } = await renderHook(() => useToday());
    expect(result.current).toBe('2026-10-05');

    await act(async () => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(result.current).toBe('2026-10-06');
  });

  it('refreshes when the app returns to the foreground after a long background', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 5, 12), advanceTimers: true });
    let onChange: (s: string) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      onChange = cb;
      return { remove };
    }) as never);
    const { result, unmount } = await renderHook(() => useToday());

    await act(async () => {
      jest.setSystemTime(new Date(2026, 9, 7, 8));
      onChange('active');
    });

    expect(result.current).toBe('2026-10-07');
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
