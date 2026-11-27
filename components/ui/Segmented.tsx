"use client";

import { useRef } from "react";

/** A choice of two or three, inline. A radio group: arrow keys move between them, and only the chosen one is a tab stop. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, step: number) {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-md bg-sunk p-0.5">
      {options.map((o, i) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (i === 0 && !options.some((x) => x.id === value)) ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={`min-h-11 rounded-md px-2 text-small transition-colors duration-[var(--bk-dur-fast)] ease-out ${
              on ? "bg-ink font-semibold text-ground" : "text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
