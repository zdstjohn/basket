import { toQuantity } from '@/lib/domain/units';
import type { Quantity } from '@/lib/domain/types';

// "16 oz", "1.5 lb", "12 ct", "2 x 15 oz": an optional pack count, an amount, a unit.
const SIZE = /^(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?|\.\d+)\s*([a-z][a-z ]*?)\.?$/i;
const COUNT_UNITS = new Set(['ct', 'count', 'each', 'ea']);
// Kroger's short forms that the shared unit table doesn't know.
const ALIASES: Record<string, string> = { gal: 'gallon', qt: 'quart', pt: 'pint', ltr: 'liter' };

/** A Kroger package size as a quantity (grams, millilitres or items); null when it can't be read. */
export function parseSize(size: string): Quantity | null {
  const m = SIZE.exec(size.trim());
  if (!m) return null;
  const packs = m[1] === undefined ? 1 : Number(m[1]);
  const amount = packs * Number(m[2]);
  if (!(amount > 0)) return null;
  const unit = m[3].trim().toLowerCase();
  return toQuantity(amount, COUNT_UNITS.has(unit) ? 'each' : (ALIASES[unit] ?? unit));
}
