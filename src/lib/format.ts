// Thin space between the ₱ glyph and the digits - without it the glyph's
// crossbar visually merges into the leading digit and reads as a
// strikethrough at the sizes used across the app (UX review finding #5).
export function formatPeso(n: number) {
  return '₱ ' + Math.round(n).toLocaleString();
}

// A typed peso amount: "80,000" and "₱ 80000" both mean 80000 (a bare
// Number() makes the comma form NaN). Anything else unparseable is NaN.
export function parseAmount(s: string) {
  return Number(s.replace(/[₱,\s]/g, ''));
}

// Short "Mon, Sep 21"-style date for the small line above screen titles.
export function formatFolioDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
