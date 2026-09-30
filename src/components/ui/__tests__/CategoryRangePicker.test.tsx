import { fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';
import { CategoryRangePicker } from '../CategoryRangePicker';

describe('CategoryRangePicker', () => {
  it('pushes the last month forward when the start month passes it', async () => {
    const onChange = jest.fn();
    const { getAllByLabelText } = await renderWithTheme(
      <CategoryRangePicker start="2026-11" end="2026-11" onChange={onChange} />,
    );

    await fireEvent.press(getAllByLabelText('Next month')[0]);
    expect(onChange).toHaveBeenCalledWith({ start: '2026-12', end: '2026-12' });
  });

  it('sets a last month, and clears it back to no end', async () => {
    const onChange = jest.fn();
    const { getByText, rerender } = await renderWithTheme(
      <CategoryRangePicker start="2026-11" end={null} onChange={onChange} />,
    );

    await fireEvent.press(getByText('No end · set a last month'));
    expect(onChange).toHaveBeenCalledWith({ start: '2026-11', end: '2026-11' });

    await rerender(<CategoryRangePicker start="2026-11" end="2027-02" onChange={onChange} />);
    await fireEvent.press(getByText('Clear'));
    expect(onChange).toHaveBeenLastCalledWith({ start: '2026-11', end: null });
  });
});
