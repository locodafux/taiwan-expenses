import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from '@/theme/ThemeProvider';

// Screens that call useTheme() (Dashboard, AddCategorySheet, Settings) need a
// real ThemeProvider ancestor - this is the one bit of setup shared across them.
export async function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}
