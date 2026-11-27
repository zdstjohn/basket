import { sameAccount, type CartDiff, type CartLine, type CartSend, type Me } from '@/lib/domain/cart';
import type { ListItem } from '@/lib/domain/list';
import type { Recommendation } from '@/lib/domain/packages';

export const FRED_MEYER_CART_URL = 'https://www.fredmeyer.com/cart';

/** Said when a send may or may not have reached the cart. The record of sends is the only memory of it. */
export const SENT_CHECK_ADVICE =
  "Basket couldn't confirm every item reached your Fred Meyer cart. Wait about 5 minutes and check the cart in the Fred Meyer app before sending again.";

/**
 * The week's Fred Meyer items as cart lines. To-buy Fred Meyer items with a product pick become lines; those without one
 * are `unmatched`. Two foods that picked the same product become one line (quantities and cents added, first key kept).
 */
export const MAX_PER_PRODUCT = 99;

export function reviewLines(
  items: ListItem[],
  products: Record<string, Recommendation>,
): { lines: CartLine[]; unmatched: ListItem[]; capped: string[] } {
  const lines: CartLine[] = [];
  const byUpc = new Map<string, CartLine>();
  const unmatched: ListItem[] = [];
  for (const i of items) {
    if (i.store !== 'fred_meyer' || i.haveIt) continue;
    const pick = products[i.key]?.pick;
    if (!pick) {
      unmatched.push(i);
      continue;
    }
    const upc = pick.candidate.upc;
    const same = byUpc.get(upc);
    if (same) {
      same.quantity += pick.count;
      same.cents += pick.totalCents;
      continue;
    }
    const line: CartLine = {
      key: i.key,
      canonical: i.canonical,
      upc,
      name: pick.candidate.name,
      quantity: pick.count,
      cents: pick.totalCents,
    };
    byUpc.set(upc, line);
    lines.push(line);
  }
  // The cart takes at most 99 of one product: a line made of several foods is cut to that, with its price.
  const capped: string[] = [];
  for (const l of lines) {
    if (l.quantity <= MAX_PER_PRODUCT) continue;
    l.cents = Math.round((l.cents * MAX_PER_PRODUCT) / l.quantity);
    l.quantity = MAX_PER_PRODUCT;
    capped.push(l.name);
  }
  return { lines, unmatched, capped };
}

/** "3:05 pm on Thursday", in the household's time zone (UTC when the zone is not one the phone knows). */
export function sentAtText(iso: string, timeZone: string): string {
  const at = new Date(iso);
  const parts = (tz: string) => {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
    return Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  };
  let p: Record<string, string>;
  try {
    p = parts(timeZone);
  } catch {
    p = parts('UTC');
  }
  return `${p.hour}:${p.minute} ${(p.dayPeriod ?? '').toLowerCase()} on ${p.weekday}`;
}

/**
 * "Sent by you at 3:05 pm on Thursday. 7 items." for the last send that counts for this Kroger account, or null.
 * Basket has no name for the other person (a send records only who signed in), so it says "someone else in your family".
 */
export function lastSendNote(sends: CartSend[], me: Me, timeZone: string): string | null {
  let last: CartSend | null = null;
  for (const s of sends) {
    if ((s.status === 'sent' || s.status === 'pending') && sameAccount(s, me) && (!last || s.sentAt > last.sentAt)) last = s;
  }
  if (!last) return null;
  const who = last.userId === me.userId ? 'you' : 'someone else in your family';
  const n = last.items.length;
  return `Sent by ${who} at ${sentAtText(last.sentAt, timeZone)}. ${n} ${n === 1 ? 'item' : 'items'}.`;
}

/** What a resend after an unsure send covers: only the lines Fred Meyer did not report as added. */
export function resendScope<T extends { upc: string }>(lines: T[], added: readonly string[]): T[] {
  const done = new Set(added);
  return lines.filter((l) => !done.has(l.upc));
}

export interface PlanLine {
  key: string;
  upc: string;
  quantity: number;
}

/**
 * What one tap on the send button asks of the server, and what that send actually adds to the cart.
 * Without `again`, the body carries the wanted totals (the server takes off what earlier sends covered) while
 * `actual` carries the differences, which is what a retry after an unsure send must be built from. With `again`
 * the server sends exactly what it is given, so both are the same: differences for new lines, totals for the rest.
 */
export function sendPlan(lines: CartLine[], diff: CartDiff, again: boolean): { body: PlanLine[]; actual: PlanLine[]; resend: boolean } {
  const plain = (l: CartLine): PlanLine => ({ key: l.key, upc: l.upc, quantity: l.quantity });
  if (again) {
    const all = [...diff.toSend, ...diff.alreadySent].map(plain);
    return { body: all, actual: all, resend: true };
  }
  const wanted = new Set(diff.toSend.map((l) => l.key));
  return { body: lines.filter((l) => wanted.has(l.key)).map(plain), actual: diff.toSend.map(plain), resend: false };
}

/**
 * The newest send of this household that went to another Fred Meyer account (not failed), worded as their cart:
 * their items are not in mine, so filling mine as well would fill two carts. Null when there is none.
 */
export function otherCartNote(sends: CartSend[], me: Me, timeZone: string): string | null {
  let last: CartSend | null = null;
  for (const s of sends) {
    if (s.status !== 'failed' && !sameAccount(s, me) && (!last || s.sentAt > last.sentAt)) last = s;
  }
  if (!last) return null;
  const at = sentAtText(last.sentAt, timeZone);
  return last.userId === me.userId
    ? `This list was sent to a different Fred Meyer account at ${at}.`
    : `Someone else in your family sent this list to their Fred Meyer cart at ${at}.`;
}
