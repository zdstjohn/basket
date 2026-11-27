/** Durations in ms. They mirror the --bk-dur-* tokens in app/globals.css. */
export const DUR = { fast: 120, base: 240, slow: 400, snap: 370, settle: 560 } as const;

/** True when the person asked the phone for less motion. Safe on the server and without matchMedia. */
export function prefersReducedMotion(win?: Pick<Window, "matchMedia">): boolean {
  try {
    const w = win ?? (typeof window === "undefined" ? undefined : window);
    return w?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}
