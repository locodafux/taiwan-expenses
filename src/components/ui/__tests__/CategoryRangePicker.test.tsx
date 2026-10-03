import { fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';
import { CategoryRangePicker } from '../CategoryRangePicker';

describe('CategoryRangePicker', () => {
  it('steps the start month and has no last-month field', async () => {
    const onChange = jest.fn();
    const { getByLabelText, queryByText } = await renderWithTheme(<CategoryRangePicker start="2026-11" onChange={onChange} />);

    await fireEvent.press(getByLabelText('Next month'));
    expect(onChange).toHaveBeenCalledWith('2026-12');
    expect(queryByText(/last month/i)).toBeNull();
  });
});
