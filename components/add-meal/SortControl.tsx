"use client";

import { useRef } from "react";
import { focusRing } from "@/lib/ui";

export type SortMode = "loved" | "fits";

const SORTS: { id: SortMode; label: string }[] = [
  { id: "loved", label: "Most loved" },
  { id: "fits", label: "Fits this week" },
];

const STORAGE_KEY = "basket:add-meal-sort";

/** The choice made earlier this visit (kept for the browser session), or Most loved. */
export function loadSort(): SortMode {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === "fits" ? "fits" : "loved";
  } catch {
    return "loved";
  }
}

export function saveSort(mode: SortMode): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not remembering is fine.
  }
}

/** Two choices in a radio group: arrow keys move between them, and only the chosen one is a tab stop. */
export function SortControl({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(from: number, step: number) {
    const next = (from + step + SORTS.length) % SORTS.length;
    onChange(SORTS[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Order results by" className="mb-2.5 grid grid-cols-2 gap-1 rounded-[14px] bg-[#EAEEE9] p-1">
      {SORTS.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          tabIndex={value === s.id ? 0 : -1}
          onClick={() => onChange(s.id)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              move(i, 1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              move(i, -1);
            }
          }}
          className={`h-11 rounded-[10px] text-sm ${focusRing} ${
            value === s.id ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-[#4A544F]"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
