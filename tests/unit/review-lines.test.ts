import { describe, expect, it } from 'vitest';
import type { ListItem } from '@/lib/domain/list';
import { cartDiff, type CartSend } from '@/lib/domain/cart';
import type { Offer, Recommendation } from '@/lib/domain/packages';
import {
  FRED_MEYER_CART_URL,
  lastSendNote,
  otherCartNote,
  resendScope,
  sendPlan,
  reviewLines,
  SENT_CHECK_ADVICE,
  sentAtText,
} from '@/lib/list/review';

const item = (key: string, over: Partial<ListItem> = {}): ListItem => ({
  key,
  canonical: key,
  qty: { amount: 1, kind: 'count', base: 'each' },
  parts: [],
  role: 'pantry',
  store: 'fred_meyer',
  estimateCents: null,
  haveIt: false,
  alwaysHave: false,
  outsideBudget: false,
  sources: [],
  ...over,
});
const offer = (upc: string, count: number, totalCents: number, name = `Product ${upc}`): Offer => ({
  candidate: {
    upc, name, brand: null, sizeText: '15 oz', size: null, soldBy: 'UNIT', regularCents: 100, promoCents: null,
    imageUrl: null, relevant: true, inStock: true,
  },
  count,
  unitCents: Math.round(totalCents / count),
  totalCents,
  onSale: false,
  approx: false,
});
const rec = (pick: Offer | null): Recommendation => ({ pick, options: pick ? [pick] : [], cheapestUpc: pick?.candidate.upc ?? null, usualMissing: false });

describe('reviewLines', () => {
  it('leaves out have-it items and Amazon items', () => {
    const items = [item('beans'), item('salt', { haveIt: true }), item('paper', { store: 'amazon' }), item('rice', { store: 'costco' })];
    const products = { beans: rec(offer('1', 1, 199)), salt: rec(offer('2', 1, 99)), paper: rec(offer('3', 1, 99)), rice: rec(offer('4', 1, 99)) };
    const out = reviewLines(items, products);
    expect(out.lines.map((l) => l.key)).toEqual(['beans']);
    expect(out.unmatched).toEqual([]);
  });
  it('puts an item with no pick in unmatched, and one with no search at all too', () => {
    const items = [item('beans'), item('tortillas'), item('lime')];
    const out = reviewLines(items, { beans: rec(offer('1', 1, 199)), tortillas: rec(null) });
    expect(out.lines.map((l) => l.key)).toEqual(['beans']);
    expect(out.unmatched.map((i) => i.key)).toEqual(['tortillas', 'lime']);
  });
  it('a line carries the pick: quantity, cents, product name, upc and the food', () => {
    const out = reviewLines([item('beans')], { beans: rec(offer('0001', 3, 597, 'Simple Truth Black Beans')) });
    expect(out.lines).toEqual([{ key: 'beans', canonical: 'beans', upc: '0001', name: 'Simple Truth Black Beans', quantity: 3, cents: 597 }]);
  });
  it('two foods that picked the same product become one line, summed, with the first key', () => {
    const items = [item('milk'), item('whole milk')];
    const products = { milk: rec(offer('9', 1, 349)), 'whole milk': rec(offer('9', 2, 698)) };
    const out = reviewLines(items, products);
    expect(out.lines).toEqual([{ key: 'milk', canonical: 'milk', upc: '9', name: 'Product 9', quantity: 3, cents: 1047 }]);
  });
});

describe('sentAtText', () => {
  it('says the time and weekday in the household time zone', () => {
    expect(sentAtText('2026-11-26T23:05:00.000Z', 'America/Los_Angeles')).toBe('3:05 pm on Thursday');
    expect(sentAtText('2026-11-26T09:00:00.000Z', 'America/Los_Angeles')).toBe('1:00 am on Thursday');
  });
  it('falls back to UTC for an unknown zone', () => {
    expect(sentAtText('2026-11-26T12:30:00.000Z', 'Nowhere/Land')).toBe('12:30 pm on Thursday');
  });
});

const send = (over: Partial<CartSend>): CartSend => ({
  id: 's', sentAt: '2026-11-26T23:05:00.000Z', userId: 'me', profileId: null, modality: 'PICKUP', status: 'sent',
  items: [{ key: 'a', canonical: 'a', upc: '1', name: 'A', quantity: 1, cents: 100 }, { key: 'b', canonical: 'b', upc: '2', name: 'B', quantity: 1, cents: 100 }],
  totalCents: 200, ...over,
});

describe('lastSendNote', () => {
  const me = { userId: 'me', profileId: null };
  it('is null when nothing was sent', () => {
    expect(lastSendNote([], me, 'UTC')).toBeNull();
    expect(lastSendNote([send({ status: 'failed' })], me, 'UTC')).toBeNull();
  });
  it('says who sent it and when', () => {
    expect(lastSendNote([send({})], me, 'America/Los_Angeles')).toBe('Sent by you at 3:05 pm on Thursday. 2 items.');
  });
  it('says someone else in the family sent it', () => {
    expect(lastSendNote([send({ userId: 'other', profileId: 'p' })], { userId: 'me', profileId: 'p' }, 'America/Los_Angeles')).toBe(
      'Sent by someone else in your family at 3:05 pm on Thursday. 2 items.',
    );
  });
  it('uses the newest counted send and ignores a different Kroger account', () => {
    const sends = [
      send({ id: 'old', sentAt: '2026-11-25T23:05:00.000Z', items: [send({}).items[0]] }),
      send({ id: 'new', sentAt: '2026-11-26T23:05:00.000Z' }),
      send({ id: 'theirs', sentAt: '2026-11-27T23:05:00.000Z', userId: 'x', profileId: 'p-x' }),
    ];
    expect(lastSendNote(sends, { userId: 'me', profileId: 'p-me' }, 'UTC')).toBe(
      'Sent by you at 11:05 pm on Thursday. 2 items.',
    );
  });
  it('says one item in the singular', () => {
    expect(lastSendNote([send({ items: [send({}).items[0]] })], me, 'UTC')).toBe('Sent by you at 11:05 pm on Thursday. 1 item.');
  });
});

describe('resendScope', () => {
  const lines = [
    { key: 'a', upc: '1', quantity: 2 },
    { key: 'b', upc: '2', quantity: 1 },
    { key: 'c', upc: '3', quantity: 4 },
  ];
  it('keeps only the lines that were not reported added', () => {
    expect(resendScope(lines, ['1', '3'])).toEqual([{ key: 'b', upc: '2', quantity: 1 }]);
  });
  it('keeps every line when nothing is known to be added', () => {
    expect(resendScope(lines, [])).toEqual(lines);
  });
});

describe('constants', () => {
  it('points at the Fred Meyer cart and tells the family to wait before sending again', () => {
    expect(FRED_MEYER_CART_URL).toBe('https://www.fredmeyer.com/cart');
    expect(SENT_CHECK_ADVICE).toBe(
      "Basket couldn't confirm every item reached your Fred Meyer cart. Wait about 5 minutes and check the cart in the Fred Meyer app before sending again.",
    );
  });
});

describe('reviewLines cap', () => {
  it('cuts a combined quantity at 99, with its price, and says which line', () => {
    const items = [item('milk'), item('whole milk')];
    const products = { milk: rec(offer('9', 60, 6000, 'Milk')), 'whole milk': rec(offer('9', 60, 6000, 'Milk')) };
    const out = reviewLines(items, products);
    expect(out.lines).toEqual([{ key: 'milk', canonical: 'milk', upc: '9', name: 'Milk', quantity: 99, cents: 9900 }]);
    expect(out.capped).toEqual(['Milk']);
  });
  it('caps nothing at or under 99', () => {
    expect(reviewLines([item('a')], { a: rec(offer('1', 99, 99)) }).capped).toEqual([]);
  });
});

describe('sendPlan', () => {
  const me = { userId: 'me', profileId: null };
  const line = { key: 'beans', canonical: 'beans', upc: '1', name: 'Beans', quantity: 3, cents: 300 };
  const earlier = send({ items: [{ ...line, quantity: 2, cents: 200 }] });
  it('keeps the wanted total in the body but the difference in what is actually sent', () => {
    const plan = sendPlan([line], cartDiff([line], [earlier], me), false);
    expect(plan.body).toEqual([{ key: 'beans', upc: '1', quantity: 3 }]);
    expect(plan.actual).toEqual([{ key: 'beans', upc: '1', quantity: 1 }]);
    expect(plan.resend).toBe(false);
  });
  it('a retry after an unsure send adds 1, not 3', () => {
    const plan = sendPlan([line], cartDiff([line], [earlier], me), false);
    expect(resendScope(plan.actual, [])).toEqual([{ key: 'beans', upc: '1', quantity: 1 }]);
  });
  it('sending again sends differences for new lines and totals for the rest', () => {
    const other = { ...line, key: 'rice', upc: '2', quantity: 2, cents: 200 };
    const sent = send({ items: [{ ...line, quantity: 3 }, { ...other, quantity: 1, cents: 100 }] });
    const plan = sendPlan([line, other], cartDiff([line, other], [sent], me), true);
    expect(plan.resend).toBe(true);
    expect(plan.body).toEqual([{ key: 'rice', upc: '2', quantity: 1 }, { key: 'beans', upc: '1', quantity: 3 }]);
    expect(plan.actual).toEqual(plan.body);
  });
});

describe('otherCartNote', () => {
  const me = { userId: 'me', profileId: 'p-me' };
  it('is null when every send went to my account, or none did', () => {
    expect(otherCartNote([], me, 'UTC')).toBeNull();
    expect(otherCartNote([send({ profileId: 'p-me' })], me, 'UTC')).toBeNull();
  });
  it('says someone else sent it to their own cart', () => {
    expect(otherCartNote([send({ userId: 'other', profileId: 'p-x' })], me, 'America/Los_Angeles')).toBe(
      'Someone else in your family sent this list to their Fred Meyer cart at 3:05 pm on Thursday.',
    );
  });
  it('ignores failed sends and takes the newest', () => {
    const sends = [
      send({ id: 'a', userId: 'o1', profileId: 'p1', sentAt: '2026-11-25T23:05:00.000Z' }),
      send({ id: 'b', userId: 'o2', profileId: 'p2', sentAt: '2026-11-27T23:05:00.000Z', status: 'failed' }),
    ];
    expect(otherCartNote(sends, me, 'UTC')).toBe('Someone else in your family sent this list to their Fred Meyer cart at 11:05 pm on Wednesday.');
  });
});
