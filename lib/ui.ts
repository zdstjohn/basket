// Shared Tailwind class strings. Focus rings come from the global :focus-visible rule in globals.css.

/** The screen's one main action: 52 px tall, filled accent. */
export const mainAction =
  "flex min-h-13 w-full items-center justify-center rounded-md bg-accent px-4 text-center text-body font-bold text-on-accent no-underline active:bg-accent-press bk-press";

/** A quieter action beside or under the main one. Wraps rather than clips. */
export const ghostButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-transparent px-3 py-2 text-center text-small font-semibold text-ink no-underline bk-press";

/** A ghost button whose words are in the error color: a destructive step. */
export const dangerGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-transparent px-3 py-2 text-center text-small font-semibold text-error no-underline bk-press";

/** A way out: ink, semibold, a chevron after it. */
export const quietLink =
  "inline-flex min-h-11 items-center gap-0.5 text-small font-semibold text-ink no-underline";

export const textInput =
  "min-h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-ink";

/** The class both pinned bars carry, so a toast can find the bar and rise above it. */
export const BAR_CLASS = "bk-bar";

/** The toast's bottom edge: above the nav, above any pinned bar (--bk-bar-h, 0px when none), then 8 px of air. */
export const toastBottom = "bottom-[calc(var(--bk-nav-h)+var(--bk-bar-h,0px)+8px)]";

/** The --bk-bar-h value for a pinned bar of this height; no bar (or an unmeasured one) lifts nothing. */
export function barLift(height: number | null | undefined): string {
  return height && height > 0 ? `${Math.ceil(height)}px` : "0px";
}

/** A bar pinned just above the bottom nav. */
export const barAboveNav =
  "bk-bar sticky bottom-[var(--bk-nav-h)] z-10 bg-ground bk-gutter pt-2 pb-2 shadow-[inset_0_1px_0_var(--bk-line)]";

/** The same bar on a full screen with no bottom nav. */
export const barBottom =
  "bk-bar sticky bottom-0 z-10 bg-ground bk-gutter pt-2 pb-[var(--bk-safe-bottom)] shadow-[inset_0_1px_0_var(--bk-line)]";
