// Mirrors the design system's tokens/colors.css. Keep in sync with that file
// if the captain ever swaps the Warm/Playful palette (readme.md caveat #1).
export const THEME_NAMES = ['original', 'warm', 'playful'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];
export const DEFAULT_THEME: ThemeName = 'warm';

export type ThemeVars = Record<string, string>;

export const THEMES: Record<ThemeName, ThemeVars> = {
  // Sunday Market: cream page, sage/apricot/butter pastels, soft brown ink.
  // Text/icon tones below are darkened just enough to clear WCAG AA (4.5:1)
  // against both --page and --surface (2026-09-28 feedback: "color
  // combination does not look good" - several were reading washed-out).
  warm: {
    '--page': '#f7f1e8',
    '--surface': '#fffaf3',
    '--surface-2': '#f1e7da',
    '--surface-3': '#e8dccb',
    '--ink': '#3a2f28',
    '--ink-2': '#6b5a4c',
    '--ink-muted': '#7a6b5e',
    '--gridline': '#eee3d5',
    '--baseline': '#d7c7b3',
    '--border': 'rgba(58,47,40,0.10)',
    '--accent': '#9d5027',
    '--accent-soft': '#fbe0c8',
    '--accent-2': '#55733f',
    '--sage-soft': '#dfe8d5',
    '--butter': '#fff3c9',
    '--status-good': '#58773e',
    '--status-bad': '#b3412e',
    '--cat-expenses': '#437394',
    '--cat-debt': '#b15026',
    '--cat-taiwan': '#43765f',
    '--cat-emergency': '#8e661a',
    '--cat-savings': '#b54870',
    '--cat-pinatubo': '#5e763d',
    '--cat-excess': '#8d644c',
  },
  original: {
    '--page': '#f9f9f7',
    '--surface': '#fcfcfb',
    '--surface-2': '#f2f1ec',
    '--surface-3': '#e9e7df',
    '--ink': '#0b0b0b',
    '--ink-2': '#52514e',
    '--ink-muted': '#74726d',
    '--gridline': '#e1e0d9',
    '--baseline': '#c3c2b7',
    '--border': 'rgba(11,11,11,0.10)',
    '--accent': '#4a3aa7',
    '--accent-soft': 'rgba(74,58,167,0.10)',
    '--accent-2': '#4a3aa7',
    '--sage-soft': '#e9efe4',
    '--butter': '#fbf4dc',
    '--status-good': '#0a820a',
    '--status-bad': '#c0392b',
    '--cat-expenses': '#2771ca',
    '--cat-debt': '#c94714',
    '--cat-taiwan': '#147e58',
    '--cat-emergency': '#966600',
    '--cat-savings': '#d72668',
    '--cat-pinatubo': '#008300',
    '--cat-excess': '#4a3aa7',
  },
  playful: {
    '--page': '#f6f4fb',
    '--surface': '#ffffff',
    '--surface-2': '#efe9fb',
    '--surface-3': '#e3d9f7',
    '--ink': '#181022',
    '--ink-2': '#544a66',
    '--ink-muted': '#776b8e',
    '--gridline': '#e6ddf5',
    '--baseline': '#cbb9ec',
    '--border': 'rgba(24,16,34,0.10)',
    '--accent': '#7c3aed',
    '--accent-soft': 'rgba(124,58,237,0.12)',
    '--accent-2': '#d61675',
    '--sage-soft': '#e3f4ea',
    '--butter': '#fff4d6',
    '--status-good': '#117f3a',
    '--status-bad': '#d81c45',
    '--cat-expenses': '#2165ec',
    '--cat-debt': '#cd390f',
    '--cat-taiwan': '#0b7d72',
    '--cat-emergency': '#996600',
    '--cat-savings': '#d61675',
    '--cat-pinatubo': '#167f3d',
    '--cat-excess': '#7c3aed',
  },
};

