/** Reads "$200", "200", "+$25", "12.50", ".99", "3." or "1,200" as cents; null when it isn't an amount. */
export function parseMoneyToCents(text: string): number | null {
  const m =
    /^\s*\+?\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?|\.\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  return Math.round(Number(m[1].replace(/,/g, "")) * 100);
}

/**
 * Cents as dollars with a thousands separator: "$3.00", "$1,234.56".
 * `zero: 'drop'` writes whole-dollar amounts without ".00" ("$200"), for amounts the family typed.
 */
export function formatMoney(cents: number, opts?: { zero: "keep" | "drop" }): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? "-" : ""; // a fraction of a cent that rounds to zero is "$0.00", never "-$0.00"
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const whole = dollars.toLocaleString("en-US");
  if (rest === 0 && opts?.zero === "drop") return `${sign}$${whole}`;
  return `${sign}$${whole}.${String(rest).padStart(2, "0")}`;
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
