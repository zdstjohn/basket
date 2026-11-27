"use client";

import { useState } from "react";
import { cleanFood, coversLine } from "@/lib/domain/families";
import { focusRing } from "@/lib/ui";

const MAX_FOODS = 30;
const MAX_LETTERS = 40;

/** Adds a typed food to a list: cleaned, once, at most 30. Pure; `error` says why nothing was added. */
export function addFood(list: string[], typed: string): { list: string[]; error: string | null } {
  const trimmed = typed.trim();
  if (trimmed.length === 0) return { list, error: null };
  if (trimmed.replace(/\s+/g, " ").length > MAX_LETTERS) return { list, error: "Keep it under 40 letters." };
  const food = cleanFood(trimmed);
  if (food === null) return { list, error: null };
  if (list.some((f) => f.toLowerCase() === food)) return { list, error: "That’s already on the list." };
  if (list.length >= MAX_FOODS) return { list, error: "That’s 30 already. Remove one first." };
  return { list: [...list, food], error: null };
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5M12 17.6h.01" />
    </svg>
  );
}

const chipBase = `inline-flex h-11 max-w-full items-center rounded-full border bg-white font-semibold text-ink ${focusRing}`;

/** One list of foods for a person (won't eat, or allergies): chips, a box to add, and a covers line. */
export function FoodChips({
  label,
  help,
  value,
  onChange,
  placeholder,
  addLabel,
  suggestions,
  allergy = false,
}: {
  label: string;
  help: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  addLabel: string;
  suggestions?: readonly string[];
  allergy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(text: string) {
    const r = addFood(value, text);
    setError(r.error);
    if (r.error === null) {
      onChange(r.list);
      setTyped("");
    }
  }

  const covers = typed.trim() ? coversLine(typed, { wide: allergy }) : null;
  const border = allergy ? "border-[#A6261B]" : "border-[#D5DBD5]";

  return (
    <div className="grid gap-2" role="group" aria-label={label}>
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        {help && <p className="mt-px text-xs text-muted">{help}</p>}
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((food) => (
            <li key={food} className="max-w-full">
              <button
                type="button"
                aria-label={`Remove ${food}`}
                onClick={() => onChange(value.filter((f) => f !== food))}
                className={`${chipBase} ${border} gap-1.5 pr-2.5 pl-3.5 text-sm`}
              >
                <span className="truncate">{food}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A544F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions && value.length === 0 && (
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => add(s)} className={`${chipBase} border-[#D5DBD5] px-3.5 text-[13px]`}>
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div className="flex gap-2">
          <input
            value={typed}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setTyped(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // Enter adds the food; it must not save the whole person
                add(typed);
              }
            }}
            className="h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          />
          <button
            type="button"
            onClick={() => add(typed)}
            className={`inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-[#D5DBD5] bg-white px-[18px] text-[13px] font-semibold text-ink ${focusRing}`}
          >
            {addLabel}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-[13px] font-medium text-[#B33A0B]">
            {error}
          </p>
        )}
        <p role="status" className={covers ? "mt-1.5 text-[13px] text-[#4A544F]" : "sr-only"}>
          {covers}
        </p>
      </div>
      {allergy && (
        <p className="flex gap-2 text-[13px] text-ink">
          <span className="mt-px flex text-[#A6261B]">
            <WarningIcon />
          </span>
          Basket only reads ingredient names, so it can miss things. Always check labels.
        </p>
      )}
    </div>
  );
}
