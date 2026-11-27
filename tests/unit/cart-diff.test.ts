import { describe, expect, it } from 'vitest';
import { cartDiff, type CartLine, type CartSend } from '@/lib/domain/cart';

const L = (upc: string, quantity: number, cents: number): CartLine => ({
  key: `${upc}#k`,
  canonical: `food ${upc}`,
  upc,
  name: `Product ${upc}`,
  quantity,
  cents,
});
const S = (
  status: CartSend['status'],
  userId: string,
  profileId: string | null,
  items: CartLine[],
  sentAt = '2026-11-26T10:00:00.000Z',
): CartSend => ({
  id: `${status}-${userId}-${sentAt}`,
  sentAt,
  userId,
  profileId,
  modality: 'PICKUP',
  status,
  items,
  totalCents: items.reduce((n, i) => n + i.cents, 0),
});
const me = { userId: 'u1', profileId: 'p1' };

describe('cartDiff', () => {
  it('sends everything when nothing was sent', () => {
    const d = cartDiff([L('A', 2, 500)], [], me);
    expect(d.toSend).toEqual([L('A', 2, 500)]);
    expect(d.alreadySent).toEqual([]);
    expect(d.toRemove).toEqual([]);
    expect(d.lastSentAt).toBeNull();
    expect(d.unsure).toBe(false);
    expect(d.byOther).toBe(false);
  });

  it('a line fully covered by an earlier send is already sent', () => {
    const d = cartDiff([L('A', 2, 500)], [S('sent', 'u1', 'p1', [L('A', 2, 500)])], me);
    expect(d.toSend).toEqual([]);
    expect(d.alreadySent).toEqual([L('A', 2, 500)]);
    expect(d.lastSentAt).toBe('2026-11-26T10:00:00.000Z');
  });

  it('an increase sends only the difference, with its share of the price', () => {
    const d = cartDiff([L('A', 3, 750)], [S('sent', 'u1', 'p1', [L('A', 2, 500)])], me);
    expect(d.toSend).toEqual([L('A', 1, 250)]);
    expect(d.alreadySent).toEqual([]);
  });

  it('rounds the price share to whole cents', () => {
    const d = cartDiff([L('A', 3, 100)], [S('sent', 'u1', 'p1', [L('A', 1, 33)])], me);
    expect(d.toSend).toEqual([L('A', 2, 67)]);
  });

  it('lists what was sent but is no longer wanted, or wanted less', () => {
    const d = cartDiff([L('A', 1, 250)], [S('sent', 'u1', 'p1', [L('A', 2, 500), L('B', 1, 300)])], me);
    expect(d.toRemove).toEqual([
      { upc: 'A', name: 'Product A', quantity: 1 },
      { upc: 'B', name: 'Product B', quantity: 1 },
    ]);
    expect(d.alreadySent).toEqual([L('A', 1, 250)]);
    expect(d.toSend).toEqual([]);
  });

  it('a failed send does not count', () => {
    const d = cartDiff([L('A', 1, 250)], [S('failed', 'u1', 'p1', [L('A', 1, 250)])], me);
    expect(d.toSend).toEqual([L('A', 1, 250)]);
    expect(d.lastSentAt).toBeNull();
  });

  it('a pending send counts, and makes the answer unsure', () => {
    const d = cartDiff([L('A', 1, 250)], [S('pending', 'u1', 'p1', [L('A', 1, 250)])], me);
    expect(d.alreadySent).toEqual([L('A', 1, 250)]);
    expect(d.toSend).toEqual([]);
    expect(d.unsure).toBe(true);
  });

  it('the same Kroger profile under another login counts, and is marked as by someone else', () => {
    const d = cartDiff([L('A', 1, 250)], [S('sent', 'u2', 'p1', [L('A', 1, 250)])], me);
    expect(d.alreadySent).toEqual([L('A', 1, 250)]);
    expect(d.byOther).toBe(true);
  });

  it('a send to a different Kroger profile does not count', () => {
    const d = cartDiff([L('A', 1, 250)], [S('sent', 'u2', 'p2', [L('A', 1, 250)])], me);
    expect(d.toSend).toEqual([L('A', 1, 250)]);
    expect(d.alreadySent).toEqual([]);
  });

  it('with no profile id of my own, only my own sends count', () => {
    const mine = { userId: 'u1', profileId: null };
    expect(cartDiff([L('A', 1, 250)], [S('sent', 'u2', 'p1', [L('A', 1, 250)])], mine).toSend).toEqual([L('A', 1, 250)]);
    expect(cartDiff([L('A', 1, 250)], [S('sent', 'u1', 'p1', [L('A', 1, 250)])], mine).alreadySent).toEqual([L('A', 1, 250)]);
  });

  it('when only one side has a profile id, the user id decides', () => {
    expect(cartDiff([L('A', 1, 250)], [S('sent', 'u1', null, [L('A', 1, 250)])], me).alreadySent).toEqual([L('A', 1, 250)]);
    expect(cartDiff([L('A', 1, 250)], [S('sent', 'u2', null, [L('A', 1, 250)])], me).toSend).toEqual([L('A', 1, 250)]);
  });

  it('adds up several earlier sends of the same product', () => {
    const d = cartDiff(
      [L('A', 2, 500)],
      [S('sent', 'u1', 'p1', [L('A', 1, 250)], '2026-11-26T09:00:00.000Z'), S('sent', 'u1', 'p1', [L('A', 1, 250)])],
      me,
    );
    expect(d.alreadySent).toEqual([L('A', 2, 500)]);
    expect(d.toSend).toEqual([]);
  });

  it('lastSentAt is the newest counted send and byOther follows that send', () => {
    const d = cartDiff(
      [L('A', 3, 750)],
      [
        S('sent', 'u2', 'p1', [L('A', 1, 250)], '2026-11-26T11:00:00.000Z'),
        S('sent', 'u1', 'p1', [L('A', 1, 250)], '2026-11-26T09:00:00.000Z'),
        S('failed', 'u1', 'p1', [L('A', 1, 250)], '2026-11-26T12:00:00.000Z'),
      ],
      me,
    );
    expect(d.lastSentAt).toBe('2026-11-26T11:00:00.000Z');
    expect(d.byOther).toBe(true);
  });
});
