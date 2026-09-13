// Thin space between the ₱ glyph and the digits - without it the glyph's
// crossbar visually merges into the leading digit and reads as a
// strikethrough at the sizes used across the app (UX review finding #5).
export function formatPeso(n: number) {
  return '₱ ' + Math.round(n).toLocaleString();
}
