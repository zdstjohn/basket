"use client";

/** An on/off setting: a real checkbox with role switch in a 48 px label. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={`relative block h-6 w-11 shrink-0 rounded-full border transition-colors duration-[var(--bk-dur-fast)] ease-out peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
          checked ? "border-ink bg-ink" : "border-line-strong bg-sunk"
        }`}
      >
        <span
          className={`absolute top-px left-px block size-5 rounded-full bg-surface transition-transform duration-[var(--bk-dur-snap)] ease-snap ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </label>
  );
}
