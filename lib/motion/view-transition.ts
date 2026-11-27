import { prefersReducedMotion } from "./motion";

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };

export function supportsViewTransitions(doc?: Document): boolean {
  const d = doc ?? (typeof document === "undefined" ? undefined : document);
  return !!d && typeof (d as VTDoc).startViewTransition === "function";
}

/**
 * Grow one element into another (a photo into its page). `update` must be synchronous (callers wrap
 * state changes in flushSync). Without the API, or under reduced motion (the default follows the phone), it just calls `update`.
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
  if (!from || (opts.reduced ?? prefersReducedMotion()) || !doc || !supportsViewTransitions(doc)) {
    update();
    return;
  }
  let dest: HTMLElement | null = null;
  let failure: { error: unknown } | null = null;
  from.style.viewTransitionName = name;
  try {
    const t = doc.startViewTransition!(() => {
      from.style.viewTransitionName = "";
      try {
        update();
      } catch (error) {
        failure = { error };
        return;
      }
      dest = to();
      if (dest) dest.style.viewTransitionName = name;
    });
    await t.finished.catch(() => undefined);
  } finally {
    from.style.viewTransitionName = "";
    const d = dest as HTMLElement | null;
    if (d) d.style.viewTransitionName = "";
  }
  // The browser swallows errors from the update callback; throw it like the plain path does.
  const f = failure as { error: unknown } | null;
  if (f) throw f.error;
}
