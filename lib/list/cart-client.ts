import type { Modality } from '@/lib/domain/cart';

export type SendResult =
  | { ok: true; sent: number; rejected: { key: string; name: string }[] }
  /** The send may have reached the cart: `added` are the products Kroger confirmed, `rejected` the ones it refused. */
  | { ok: false; reason: 'unsure'; added: string[]; rejected: { key: string; name: string }[] }
  | { ok: false; reason: 'not_connected' | 'already_sent' | 'already_sending' | 'rejected' | 'too_many' | 'busy' | 'allowance_spent' | 'failed' | 'no_answer' };

/** The codes the route returns only before it sends anything to Fred Meyer, so nothing can have been added. */
const NOTHING_SENT = new Set(['bad_request', 'unknown_product', 'no_store', 'not_configured', 'unavailable', 'save_failed', 'forbidden']);

const isNamed = (r: unknown): r is { key: string; name: string } =>
  typeof r === 'object' && r !== null && typeof (r as { key?: unknown }).key === 'string' && typeof (r as { name?: unknown }).name === 'string';

/**
 * Asks the server to add products to the signed-in person's Fred Meyer cart. `quantity` is the wanted total of that
 * product; the server sends only what earlier sends have not covered, unless `resend`. Never throws.
 */
export async function sendCart(body: {
  weekId: string;
  modality: Modality;
  lines: { key: string; upc: string; quantity: number }[];
  resend: boolean;
}): Promise<SendResult> {
  try {
    const res = await fetch('/api/kroger/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { sent?: number; rejected?: unknown; ok?: unknown; error?: string };
    if (res.ok) return { ok: true, sent: json.sent ?? 0, rejected: Array.isArray(json.rejected) ? json.rejected.filter(isNamed) : [] };
    // 409 means three things; the body says which. Only the cases the person can act on get their own reason.
    if (res.status === 409) {
      if (json.error === 'not_connected') return { ok: false, reason: 'not_connected' };
      if (json.error === 'already_sent') return { ok: false, reason: 'already_sent' };
      if (json.error === 'already_sending') return { ok: false, reason: 'already_sending' };
      return { ok: false, reason: NOTHING_SENT.has(json.error ?? '') ? 'failed' : 'no_answer' };
    }
    if (res.status === 504) {
      const added = Array.isArray(json.ok) ? json.ok.filter((u): u is string => typeof u === 'string') : [];
      return { ok: false, reason: 'unsure', added, rejected: Array.isArray(json.rejected) ? json.rejected.filter(isNamed) : [] };
    }
    // Only the route's own refusal says Fred Meyer wouldn't take the items; a platform 502 from a crashed function says nothing.
    if (res.status === 502 && json.error === 'rejected') return { ok: false, reason: 'rejected' };
    // 429 is either Basket's own daily limit (too_many) or Kroger's rate limit (slow_down); both are refused before anything is added.
    if (res.status === 429 && json.error === 'too_many') return { ok: false, reason: 'too_many' };
    if (res.status === 429 && json.error === 'slow_down') return { ok: false, reason: 'busy' };
    if (res.status === 429 && json.error === 'allowance_spent') return { ok: false, reason: 'allowance_spent' };
    // Only a known pre-send code proves nothing was added. Anything else may have reached the cart, so it is not a failure.
    return { ok: false, reason: NOTHING_SENT.has(json.error ?? '') ? 'failed' : 'no_answer' };
  } catch {
    // The answer was lost, not the send: the route may still be running or may have finished.
    return { ok: false, reason: 'no_answer' };
  }
}
