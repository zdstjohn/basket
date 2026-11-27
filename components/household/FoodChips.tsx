"use client";

import { useEffect, useRef } from "react";
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

/** True when an allergy names no food family: Basket can only look for those exact words. */
export function exactWordsOnly(food: string): boolean {
  return coversLine(food, { wide: true }) === null;
}

/** The nine common allergies stay on offer while the list is empty or any entry matches nothing (a typo). */
export function showSuggestions(allergies: string[]): boolean {
  return allergies.length === 0 || allergies.some(exactWordsOnly);
}

/** What EACH allergy covers, once each; "None…" when the list is empty; "" when nothing matched. */
export function allergyHelp(allergies: string[]): string {
  if (allergies.length === 0) return "None. Tap one, or type your own.";
  const lines = allergies.map((a) => coversLine(a, { wide: true })).filter((l): l is string => l !== null);
  return [...new Set(lines)].join(" ");
}

/** Three-way merge of one list: keep what I added and removed since `base`, take the rest from `fresh`. */
export function mergeList(base: string[], mine: string[], fresh: string[]): string[] {
  const added = mine.filter((f) => !base.includes(f));
  const removed = base.filter((f) => !mine.includes(f));
  return [...fresh.filter((f) => !removed.includes(f)), ...added.filter((f) => !fresh.includes(f))];
}

export const EXACT_WORDS = "Basket will look for these exact words only.";

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
  typed,
  onTyped,
  error,
  onError,
  placeholder,
  addLabel,
  suggestions,
  allergy = false,
}: {
  label: string;
  help: string;
  value: string[];
  onChange: (v: string[]) => void;
  /** What is in the box right now. The parent owns it so Save can add it first. */
  typed: string;
  onTyped: (t: string) => void;
  error: string | null;
  onError: (e: string | null) => void;
  placeholder: string;
  addLabel: string;
  suggestions?: readonly string[];
  allergy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      input.current?.focus();
    }
  });

  function add(text: string, fromBox = true) {
    const r = addFood(value, text);
    onError(r.error);
    if (r.error === null) {
      onChange(r.list);
      if (fromBox) onTyped(""); // a tapped suggestion leaves what is being typed alone
    }
  }

  const covers = typed.trim() ? coversLine(typed, { wide: allergy }) : null;
  const statusText = covers ?? (allergy && typed.trim() ? EXACT_WORDS : null);
  const border = allergy ? "border-[#A6261B]" : "border-[#D5DBD5]";
  const offered = (suggestions ?? []).filter((s) => !value.includes(s));
  const showOffer = suggestions !== undefined && (allergy ? showSuggestions(value) : value.length === 0);

  return (
    <div className="grid gap-2" role="group" aria-label={label}>
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        {help && <p className="mt-px text-xs text-muted">{help}</p>}
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap items-start gap-2">
          {value.map((food) => (
            <li key={food} className="max-w-full">
              <span className={`inline-flex h-11 max-w-full items-center rounded-full border bg-white text-sm font-semibold text-ink ${border}`}>
                <span className="truncate pr-1 pl-3.5">{food}</span>
                <button
                  type="button"
                  aria-label={`Remove ${food}`}
                  onClick={() => {
                    refocus.current = true;
                    onChange(value.filter((f) => f !== food));
                  }}
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-full ${focusRing}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A544F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
              {allergy && exactWordsOnly(food) && <p className="mt-1 max-w-[16rem] text-xs text-[#4A544F]">{EXACT_WORDS}</p>}
            </li>
          ))}
        </ul>
      )}
      {showOffer && offered.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {offered.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => add(s, false)} className={`${chipBase} border-[#D5DBD5] px-3.5 text-[13px]`}>
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div className="flex gap-2">
          <input
            ref={input}
            value={typed}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              onTyped(e.target.value);
              onError(null);
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
        <p role="status" className={statusText ? "mt-1.5 text-[13px] text-[#4A544F]" : "sr-only"}>
          {statusText}
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
