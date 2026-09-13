/**
 * Colors are CSS custom properties (see src/theme/tokens.ts for the three
 * palettes) so ThemeProvider can swap them at runtime via nativewind's
 * vars() - see docs/design-system readme "three switchable themes".
 * Spacing/radius/type scale are static across themes (only colors vary,
 * per the design system's tokens/colors.css).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-muted': 'var(--ink-muted)',
        gridline: 'var(--gridline)',
        baseline: 'var(--baseline)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-2': 'var(--accent-2)',
        'status-good': 'var(--status-good)',
        'status-bad': 'var(--status-bad)',
        'cat-expenses': 'var(--cat-expenses)',
        'cat-debt': 'var(--cat-debt)',
        'cat-taiwan': 'var(--cat-taiwan)',
        'cat-emergency': 'var(--cat-emergency)',
        'cat-savings': 'var(--cat-savings)',
        'cat-pinatubo': 'var(--cat-pinatubo)',
        'cat-excess': 'var(--cat-excess)',
      },
      fontFamily: {
        display: ['BricolageGrotesque_700Bold'],
        'display-semibold': ['BricolageGrotesque_600SemiBold'],
        body: ['PublicSans_400Regular'],
        'body-medium': ['PublicSans_500Medium'],
        'body-semibold': ['PublicSans_600SemiBold'],
        'body-bold': ['PublicSans_700Bold'],
        mono: ['IBMPlexMono_500Medium'],
        'mono-semibold': ['IBMPlexMono_600SemiBold'],
      },
      fontSize: {
        xs: '11px',
        sm: '12.5px',
        base: '13.5px',
        md: '16px',
        lg: '19px',
        xl: '24px',
        '2xl': '32px',
      },
      spacing: {
        1: '4px',
        2: '6px',
        3: '8px',
        4: '10px',
        5: '12px',
        6: '14px',
        7: '16px',
        8: '18px',
        9: '20px',
        10: '24px',
        11: '28px',
        12: '32px',
        13: '36px',
        14: '44px',
        15: '64px',
      },
      borderRadius: {
        sm: '9px',
        md: '12px',
        lg: '14px',
        xl: '16px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
