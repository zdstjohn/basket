// Shared Tailwind class strings so every screen gets the same focus ring and sizes.
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green";

export const primaryButton = `inline-flex h-12 w-full items-center justify-center rounded-full bg-green px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`;

export const pillButton = `inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-[#D5DBD5] bg-white px-4 text-[13px] font-semibold text-ink disabled:text-muted ${focusRing}`;

export const textInput = `h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink ${focusRing}`;

// A main action pinned just above the bottom nav (6 + 44 + 14 px of nav, plus the phone's safe area).
export const stickyAboveNav =
  "sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 bg-ground/95 px-5 pt-3 pb-2.5 backdrop-blur-sm";

export const bigGreenLink = `flex h-[52px] w-full items-center justify-center rounded-full bg-green text-base font-semibold text-white no-underline disabled:opacity-60 ${focusRing}`;

// The same bar on a full screen with no bottom nav (Add a meal).
export const stickyBottom =
  "sticky bottom-0 z-10 bg-ground/95 px-5 pt-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur-sm";
