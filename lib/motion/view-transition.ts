type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };

export function supportsViewTransitions(doc?: Document): boolean {
  const d = doc ?? (typeof document === "undefined" ? undefined : document);
  return !!d && typeof (d as VTDoc).startViewTransition === "function";
}

/**
 * Grow one element into another (a photo into its page). `update` must be synchronous (callers wrap
 * state changes in flushSync). Without the API, or under reduced motion, it just calls `update`.
 */
export async function morph(opts: {
  from: HTMLElement | null;
  to: () => HTMLElement | null;
  update: () => void;
  name?: string;
  doc?: Document;
  reduced?: boolean;
}): Promise<void> {
  const { from, to, update } = opts;
  const name = opts.name ?? "meal-photo";
  const doc = (opts.doc ?? (typeof document === "undefined" ? undefined : document)) as VTDoc | undefined;
  if (!from || opts.reduced || !doc || !supportsViewTransitions(doc)) {
    update();
    return;
  }
  let dest: HTMLElement | null = null;
  from.style.viewTransitionName = name;
  try {
    const t = doc.startViewTransition!(() => {
      from.style.viewTransitionName = "";
      update();
      dest = to();
      if (dest) dest.style.viewTransitionName = name;
    });
    await t.finished.catch(() => undefined);
  } finally {
    from.style.viewTransitionName = "";
    const d = dest as HTMLElement | null;
    if (d) d.style.viewTransitionName = "";
  }
}
