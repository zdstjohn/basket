"use client";

import { useEffect, useRef } from "react";
import { cleanFood, coversLine } from "@/lib/domain/families";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/Field";
import { ghostButton } from "@/lib/ui";

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
  const field = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      field.current?.querySelector("input")?.focus();
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
  const offered = (suggestions ?? []).filter((s) => !value.includes(s));
  const showOffer = suggestions !== undefined && (allergy ? showSuggestions(value) : value.length === 0);

  return (
    <div className="grid gap-2" role="group" aria-label={label}>
      <div>
        <p className="text-small font-semibold text-ink">{label}</p>
        {help && <p className="text-small text-ink-soft">{help}</p>}
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap items-start gap-2">
          {value.map((food) => (
            <li key={food} className="max-w-full">
              <Chip
                removeLabel={`Remove ${food}`}
                onRemove={() => {
                  refocus.current = true;
                  onChange(value.filter((f) => f !== food));
                }}
              >
                <span className="min-w-0 break-words py-2">{food}</span>
              </Chip>
              {allergy && exactWordsOnly(food) && <p className="mt-1 text-small text-ink-soft">{EXACT_WORDS}</p>}
            </li>
          ))}
        </ul>
      )}
      {showOffer && offered.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {offered.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => add(s, false)} className={ghostButton}>
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div ref={field} className="flex items-start gap-2">
          <TextField
            className="min-w-0 flex-1"
            label={placeholder}
            hideLabel
            placeholder={placeholder}
            value={typed}
            error={error ?? undefined}
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
          />
          <Button variant="ghost" onClick={() => add(typed)}>
            {addLabel}
          </Button>
        </div>
        <p role="status" className={statusText ? "mt-2 text-small text-ink-soft" : "sr-only"}>
          {statusText}
        </p>
      </div>
      {allergy && (
        <p className="flex items-start gap-2 text-small text-ink">
          <Icon icon={TriangleAlert} size={18} className="mt-0.5 text-error" />
          <span className="min-w-0">Basket only reads ingredient names, so it can miss things. Always check labels.</span>
        </p>
      )}
    </div>
  );
}
