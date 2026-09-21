/**
 * Colors are CSS custom properties (see src/theme/tokens.ts for the three
 * palettes) so ThemeProvider can swap them at runtime via nativewind's
 * vars() - see docs/design-system readme "three switchable themes".
 * Spacing/radius/type scale are static across themes (only colors vary,
 * per the design system's tokens/colors.css).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
        'sage-soft': 'var(--sage-soft)',
        butter: 'var(--butter)',
      },
      // Sunday Market type: Fraunces (a soft serif) for headings and every
      // peso amount, Figtree for everything else. `mono` is kept as the name
      // for "amount/number" text so screens didn't need rewriting; it is not
      // a monospace face.
      fontFamily: {
        display: ['Fraunces_600SemiBold'],
        'display-semibold': ['Fraunces_500Medium'],
        body: ['Figtree_400Regular'],
        'body-medium': ['Figtree_500Medium'],
        'body-semibold': ['Figtree_600SemiBold'],
        'body-bold': ['Figtree_700Bold'],
        mono: ['Fraunces_600SemiBold'],
        'mono-semibold': ['Fraunces_700Bold'],
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
      // Soft, generous corners; hero surfaces also cut one corner small
      // (rounded-lg + rounded-bl-sm) for the "leaf" shape.
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '20px',
        xl: '24px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
