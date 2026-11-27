import { toQuantity } from '@/lib/domain/units';
import type { Quantity } from '@/lib/domain/types';

// "16 oz", "1.5 lb", "1/2 gal", "12 ct", "2 x 15 oz": an optional pack count, an amount, a unit.
const AMOUNT = String.raw`\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?|\.\d+`;
const SIZE = new RegExp(String.raw`^(?:(\d+(?:\.\d+)?)\s*x\s*)?(${AMOUNT})\s*([a-z][a-z ]*?)\.?$`, 'i');
// "6 ct / 16.9 fl oz": a pack count, then the size of each.
const PACK = new RegExp(String.raw`^(\d+(?:\.\d+)?)\s*(?:ct|count|pk|pack)\s*/\s*(.+)$`, 'i');
const COUNT_UNITS = new Set(['ct', 'count', 'each', 'ea']);
// Kroger's short forms that the shared unit table doesn't know.
const ALIASES: Record<string, string> = { gal: 'gallon', qt: 'quart', pt: 'pint', ltr: 'liter' };
// A trailing container word ("5 lb bag") says nothing about the size.
const CONTAINER = /\s+(?:bag|box|bottle|carton|jar|can|pouch|tub|container|pkg|package|tray)s?$/i;

function amountOf(text: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(text);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(text);
}

/** A Kroger package size as a quantity (grams, millilitres or items); null when it can't be read. */
export function parseSize(size: string): Quantity | null {
  const text = size.trim().toLowerCase();
  if (text === 'each' || text === 'ea') return { amount: 1, kind: 'count', base: 'each' };
  const pack = PACK.exec(text);
  if (pack) {
    const inner = parseSize(pack[2]);
    const n = Number(pack[1]);
    return inner && inner.kind !== 'count' && n > 0 ? { ...inner, amount: inner.amount * n } : null;
  }
  const m = SIZE.exec(text.replace(CONTAINER, ''));
  if (!m) return null;
  const packs = m[1] === undefined ? 1 : Number(m[1]);
  const amount = packs * amountOf(m[2]);
  if (!(amount > 0) || !Number.isFinite(amount)) return null;
  const unit = m[3].trim();
  return toQuantity(amount, COUNT_UNITS.has(unit) ? 'each' : (ALIASES[unit] ?? unit));
}
