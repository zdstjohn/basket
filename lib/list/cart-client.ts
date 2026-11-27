import type { Modality } from '@/lib/domain/cart';

export type SendResult =
  | { ok: true; sent: number; rejected: { key: string; name: string }[] }
  | { ok: false; reason: 'not_connected' | 'already_sent' | 'unsure' | 'rejected' | 'too_many' | 'failed' };

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
    const json = (await res.json().catch(() => ({}))) as { sent?: number; rejected?: { key: string; name: string }[]; error?: string };
    if (res.ok) return { ok: true, sent: json.sent ?? 0, rejected: json.rejected ?? [] };
    // 409 means three things; the body says which. Only the cases the person can act on get their own reason.
    if (res.status === 409) {
      if (json.error === 'not_connected') return { ok: false, reason: 'not_connected' };
      if (json.error === 'already_sent') return { ok: false, reason: 'already_sent' };
      return { ok: false, reason: 'failed' };
    }
    if (res.status === 504) return { ok: false, reason: 'unsure' };
    if (res.status === 502) return { ok: false, reason: 'rejected' };
    if (res.status === 429) return { ok: false, reason: 'too_many' };
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
