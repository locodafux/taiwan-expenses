import { fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';
import { MonthPicker } from '../MonthPicker';

describe('MonthPicker', () => {
  // The app starts in October 2026: even a caller passing an earlier `min`
  // (or a stale value) can't step before it.
  it('never steps before October 2026, whatever min the caller passes', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await renderWithTheme(<MonthPicker value="2026-10" min="2026-08" onChange={onChange} />);

    await fireEvent.press(getByLabelText('Previous month'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('starts an empty picker at October 2026 at the earliest', async () => {
    const onChange = jest.fn();
    const { getByText } = await renderWithTheme(<MonthPicker value={null} min="2026-09" onChange={onChange} />);

    await fireEvent.press(getByText('Never ends · set a last month'));
    expect(onChange).toHaveBeenCalledWith('2026-10');
  });
});
