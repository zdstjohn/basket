"use client";

import { useId } from "react";

/** A choice among a few, as rows split by hairlines. Real radio inputs, so the phone's own keyboard and reader behavior apply. */
export function RadioRows<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: T; label: string; detail?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const uid = useId();
  return (
    <div role="radiogroup" aria-label={label} className="divide-y divide-line">
      {options.map((o) => {
        const on = value === o.value;
        const labelId = `${uid}-${o.value}-label`;
        const detailId = `${uid}-${o.value}-detail`;
        return (
          <label key={o.value} className="relative flex min-h-13 cursor-pointer items-center gap-3 py-2">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              onChange={() => onChange(o.value)}
              aria-labelledby={labelId}
              aria-describedby={o.detail ? detailId : undefined}
              className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden="true"
              className={`grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-[var(--bk-dur-fast)] ease-out peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                on ? "border-ink bg-ink" : "border-line-strong"
              }`}
            >
              <span className={`size-2 rounded-full bg-ground transition-opacity duration-[var(--bk-dur-fast)] ease-out ${on ? "opacity-100" : "opacity-0"}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span id={labelId} className="block text-body text-ink">
                {o.label}
              </span>
              {o.detail && (
                <span id={detailId} className="block text-small text-ink-soft">
                  {o.detail}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
