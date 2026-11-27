import { prefersReducedMotion } from "./motion";

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };

export function supportsViewTransitions(doc?: Document): boolean {
  const d = doc ?? (typeof document === "undefined" ? undefined : document);
  return !!d && typeof (d as VTDoc).startViewTransition === "function";
}

/** If the browser has not called the update by now, it runs anyway, so a tap always does its job. */
const SAFETY_MS = 250;
/** The longest morph waits for a transition to finish. */
const MAX_WAIT_MS = 2000;

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
  let ran = false;
  // The page must change exactly once, whoever gets there first: the browser's callback, the safety timer, or the plain fallback.
  const run = () => {
    if (ran) return;
    ran = true;
    from.style.viewTransitionName = "";
    try {
      update();
    } catch (error) {
      failure = { error };
      return;
    }
    dest = to();
    if (dest) dest.style.viewTransitionName = name;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cap: ReturnType<typeof setTimeout> | undefined;
  from.style.viewTransitionName = name;
  try {
    let t: { finished: Promise<unknown> } | null = null;
    try {
      t = doc.startViewTransition!(run);
    } catch {
      run(); // the browser refused: just change the page
    }
    if (t) {
      // If the browser never calls back (a dropped or delayed transition), the tap must still do its job.
      timer = setTimeout(run, SAFETY_MS);
      // And never wait on a transition that never finishes.
      const capped = new Promise<void>((resolve) => {
        cap = setTimeout(resolve, MAX_WAIT_MS);
      });
      await Promise.race([t.finished.catch(() => undefined), capped]);
    }
  } finally {
    clearTimeout(timer);
    clearTimeout(cap);
    run(); // a no-op once it has run; makes sure the page changed even if waiting was cut short
    from.style.viewTransitionName = "";
    const d = dest as HTMLElement | null;
    if (d) d.style.viewTransitionName = "";
  }
  // The browser swallows errors from the update callback; throw it like the plain path does.
  const f = failure as { error: unknown } | null;
  if (f) throw f.error;
}
