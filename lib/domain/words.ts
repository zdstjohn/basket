/** One word, lower case, singular: "limes" and "lime" both become "lime". */
export function singular(w: string): string {
  if (w.length > 5 && w.endsWith('leaves')) return `${w.slice(0, -6)}leaf`;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(?:o|ch|sh|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Lower case words, split on anything that is not a letter, exactly as written otherwise. */
export function rawWords(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

/** The same words, each made singular. Same positions as `rawWords`. */
export function words(s: string): string[] {
  return rawWords(s).map(singular);
}
