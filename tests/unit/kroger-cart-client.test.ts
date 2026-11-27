import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendCart } from '@/lib/list/cart-client';

const body = { weekId: 'w', modality: 'PICKUP' as const, lines: [{ key: 'k', upc: '0020000000001', quantity: 1 }], resend: false };
const answer = (status: number, json: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(json), { status })));
afterEach(() => vi.unstubAllGlobals());

describe('sendCart', () => {
  it('posts the body and reads a success', async () => {
    answer(200, { sent: 2, rejected: [{ key: 'k', name: 'Milk' }] });
    expect(await sendCart(body)).toEqual({ ok: true, sent: 2, rejected: [{ key: 'k', name: 'Milk' }] });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/kroger/cart');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
  });
  it('reads the 409 by its code, not its status', async () => {
    answer(409, { error: 'not_connected' });
    expect(await sendCart(body)).toEqual({ ok: false, reason: 'not_connected' });
    answer(409, { error: 'already_sent' });
    expect(await sendCart(body)).toEqual({ ok: false, reason: 'already_sent' });
    answer(409, { error: 'already_sending' });
    expect(await sendCart(body)).toEqual({ ok: false, reason: 'failed' });
    answer(409, { error: 'no_store' });
    expect(await sendCart(body)).toEqual({ ok: false, reason: 'failed' });
  });
  it('maps the other statuses', async () => {
    for (const [status, reason] of [[504, 'unsure'], [502, 'rejected'], [429, 'too_many'], [500, 'failed'], [503, 'failed'], [400, 'failed']] as const) {
      answer(status, { error: 'x' });
      expect(await sendCart(body)).toEqual({ ok: false, reason });
    }
  });
  it('a thrown fetch is failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await sendCart(body)).toEqual({ ok: false, reason: 'failed' });
  });
});
