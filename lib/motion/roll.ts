export type RollDigit = { char: string; from: string | null; delayMs: number };

const isDigit = (c: string) => c >= "0" && c <= "9";

/**
 * One entry per character of `next`, compared from the right. `from` is the old digit when a digit
 * changed (a new leading digit rolls in from a blank), otherwise null. `delayMs` is 30 per changed
 * digit, counted from the right-most changed digit.
 */
export function rollDigits(prev: string, next: string): RollDigit[] {
  const out: RollDigit[] = new Array(next.length);
  let rank = 0;
  for (let i = next.length - 1; i >= 0; i--) {
    const char = next[i];
    const j = i - (next.length - prev.length);
    const old = j >= 0 ? prev[j] : " ";
    if (isDigit(char) && old !== char) {
      out[i] = { char, from: isDigit(old) ? old : " ", delayMs: 30 * rank };
      rank++;
    } else {
      out[i] = { char, from: null, delayMs: 0 };
    }
  }
  return out;
}

export function rollDirection(prevCents: number, nextCents: number): "up" | "down" {
  return nextCents >= prevCents ? "up" : "down";
}
