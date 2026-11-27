export type Modality = 'PICKUP' | 'DELIVERY';

/** One product in a cart send. `quantity` is a whole number of packages; `cents` is the price of those packages. */
export interface CartLine {
  key: string;
  canonical: string;
  upc: string;
  name: string;
  quantity: number;
  cents: number;
}

/** One try at filling the Fred Meyer cart, as recorded: `items` is exactly what was asked of Kroger. */
export interface CartSend {
  id: string;
  sentAt: string;
  userId: string;
  profileId: string | null;
  modality: Modality;
  status: 'pending' | 'sent' | 'failed';
  items: CartLine[];
  totalCents: number;
}

export interface CartDiff {
  /** New items in full; increases as the difference. */
  toSend: CartLine[];
  /** Lines fully covered by earlier sends. */
  alreadySent: CartLine[];
  /** Sent before, no longer wanted (or wanted less). The cart API cannot remove them: this is for the shopper to see. */
  toRemove: { upc: string; name: string; quantity: number }[];
  lastSentAt: string | null;
  /** A counted send is still `pending`: Kroger may or may not have added it. */
  unsure: boolean;
  /** The last counted send was made by someone else. */
  byOther: boolean;
}

export type Me = { userId: string; profileId: string | null };

/** A send went to the same Kroger account as mine: equal profile ids when both are known, else the same login. */
export const sameAccount = (s: CartSend, me: Me): boolean =>
  s.profileId !== null && me.profileId !== null ? s.profileId === me.profileId : s.userId === me.userId;

/**
 * What still has to go to the cart, given what earlier sends put there. Kroger's cart cannot be read back, so
 * the record of sends is the only memory. `lines[].quantity` is the wanted total for that product. Failed sends
 * did not reach the cart; pending ones may have, so they count.
 */
export function cartDiff(lines: CartLine[], sends: CartSend[], me: Me): CartDiff {
  const counted = sends.filter((s) => (s.status === 'sent' || s.status === 'pending') && sameAccount(s, me));
  const sent = new Map<string, { quantity: number; name: string }>();
  for (const s of counted) {
    for (const i of s.items) {
      const prev = sent.get(i.upc);
      sent.set(i.upc, { quantity: (prev?.quantity ?? 0) + i.quantity, name: prev?.name ?? i.name });
    }
  }

  const toSend: CartLine[] = [];
  const alreadySent: CartLine[] = [];
  for (const l of lines) {
    const have = sent.get(l.upc)?.quantity ?? 0;
    if (have <= 0) toSend.push(l);
    else if (have >= l.quantity) alreadySent.push(l);
    else {
      const more = l.quantity - have;
      toSend.push({ ...l, quantity: more, cents: Math.round((l.cents * more) / l.quantity) });
    }
  }
  const wanted = new Map(lines.map((l) => [l.upc, l.quantity]));
  const toRemove = [...sent]
    .map(([upc, v]) => ({ upc, name: v.name, quantity: v.quantity - (wanted.get(upc) ?? 0) }))
    .filter((r) => r.quantity > 0);

  let last: CartSend | null = null;
  for (const s of counted) if (!last || s.sentAt > last.sentAt) last = s;
  return {
    toSend,
    alreadySent,
    toRemove,
    lastSentAt: last?.sentAt ?? null,
    unsure: counted.some((s) => s.status === 'pending'),
    byOther: last !== null && last.userId !== me.userId,
  };
}
