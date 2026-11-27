// Shared Tailwind class strings. Focus rings come from the global :focus-visible rule in globals.css.

/** The screen's one main action: 52 px tall, filled accent. */
export const mainAction =
  "flex min-h-13 w-full items-center justify-center rounded-md bg-accent px-4 text-center text-body font-bold text-on-accent no-underline active:bg-accent-press bk-press";

/** A quieter action beside or under the main one. Wraps rather than clips. */
export const ghostButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-transparent px-3 py-2 text-center text-small font-semibold text-ink no-underline bk-press";

/** A way out: ink, semibold, a chevron after it. */
export const quietLink =
  "inline-flex min-h-11 items-center gap-0.5 text-small font-semibold text-ink no-underline";

export const textInput =
  "min-h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-ink";

/** A bar pinned just above the bottom nav. */
export const barAboveNav =
  "sticky bottom-[var(--bk-nav-h)] z-10 bg-ground bk-gutter pt-2 pb-2 shadow-[inset_0_1px_0_var(--bk-line)]";

/** The same bar on a full screen with no bottom nav. */
export const barBottom =
  "sticky bottom-0 z-10 bg-ground bk-gutter pt-2 pb-[var(--bk-safe-bottom)] shadow-[inset_0_1px_0_var(--bk-line)]";

// LEGACY NAMES: deleted in Task C2
export const primaryButton = mainAction;
export const bigGreenLink = mainAction;
export const pillButton = ghostButton;
export const stickyAboveNav = barAboveNav;
export const stickyBottom = barBottom;
export const focusRing = "";
