// Shared Tailwind class strings so every screen gets the same focus ring and sizes.
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green";

export const primaryButton = `inline-flex h-12 w-full items-center justify-center rounded-full bg-green px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`;

export const pillButton = `inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-[#D5DBD5] bg-white px-4 text-[13px] font-semibold text-ink disabled:text-muted ${focusRing}`;

export const textInput = `h-11 w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink ${focusRing}`;
