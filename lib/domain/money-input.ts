/** Reads "$200", "200", "+$25" or "12.50" as cents; null when it isn't an amount. */
export function parseMoneyToCents(text: string): number | null {
  const m = /^\s*\+?\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*$/.exec(text);
  if (!m) return null;
  return Math.round(Number(m[1]) * 100);
}

/** Whole dollars read "$200"; otherwise "$12.50". */
export function formatDollars(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}

/** The wiggle room reads as an extra: "+$25". */
export function formatExtra(cents: number): string {
  return `+${formatDollars(cents)}`;
}
