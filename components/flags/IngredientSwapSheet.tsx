"use client";

import { useState } from "react";
import { allergyHits, eatersLeft, ideaNote, inWords } from "@/components/flags/swap-notes";
import { Sheet } from "@/components/Sheet";
import { cleanFood, swapIdeas } from "@/lib/domain/families";
import { AllergyBox } from "@/components/flags/AllergyBox";
import { flagCopy, namesLabel, type Flag } from "@/lib/domain/flags";
import type { Meal, Person, SwapIdea } from "@/lib/domain/types";
import { focusRing, pillButton, textInput } from "@/lib/ui";

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Mushrooms drop to four people’s worth." — one person and nobody are worded as such. */
function dropNote(food: string, plural: boolean, n: number): string {
  if (n === 0) return `${capital(food)} ${plural ? "come" : "comes"} off the list.`;
  const worth = n === 1 ? "one person’s worth" : `${inWords(n)} people’s worth`;
  return `${capital(food)} ${plural ? "drop" : "drops"} to ${worth}.`;
}

/** "Instead of mushrooms": pick one of a few ideas, or type a food, for the people who won't eat it. */
export function IngredientSwapSheet({
  flag,
  people,
  mealName,
  meal,
  onPick,
  onClose,
}: {
  flag: Flag;
  people: Person[];
  mealName: string;
  meal: Meal;
  onPick: (swap: SwapIdea) => void;
  onClose: () => void;
}) {
  const ideas = swapIdeas(flag.food);
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const who = namesLabel(flag.people, people);
  const typedFood = cleanFood(typed);
  const swap: SwapIdea | null =
    chosen !== null
      ? ideas[chosen]
      : typedFood
        ? { canonical: typedFood, amountPerServing: 1, unit: "each", role: "other" }
        : null;
  // Anyone's allergy counts: the food goes on the one shared list. Swapping an allergen in is not offered from here.
  const hits = allergyHits(swap, people);
  const plural = flagCopy(flag, people).pronoun === "them";

  return (
    <Sheet label={`Instead of ${flag.food}`} onClose={onClose}>
      <div className="flex flex-col gap-3 p-5 pb-6">
        <div>
          <h2 className="text-[22px] font-bold leading-tight">Instead of {flag.food}</h2>
          <p className="mt-1 text-sm text-muted">
            For {who}, in {mealName}.
          </p>
        </div>

        {ideas.length > 0 && (
          <div role="radiogroup" aria-label={`Instead of ${flag.food}`} className="flex flex-col gap-2">
            {ideas.map((idea, i) => (
              <label
                key={idea.canonical}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${chosen === i ? "border-green bg-green-tint" : "border-line bg-white"}`}
              >
                <input
                  type="radio"
                  name="swap-idea"
                  checked={chosen === i}
                  onChange={() => {
                    setChosen(i);
                    setTyped("");
                  }}
                  className="size-5 accent-green"
                />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{capital(idea.canonical)}</span>
                  <span className="block text-xs text-muted">{ideaNote(idea, meal)}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <label className="grid gap-1 text-sm font-semibold">
          Or something else
          <input
            value={typed}
            placeholder="Type a food"
            maxLength={40}
            onChange={(e) => {
              setTyped(e.target.value);
              if (e.target.value.trim()) setChosen(null);
            }}
            className={textInput}
          />
        </label>

        {hits.length > 0 && <AllergyBox flags={hits} people={people} className="" />}

        <p className="text-sm text-[#4A544F]">
          {dropNote(flag.food, plural, eatersLeft(flag, meal, people))} We’ll remember this for next time you make it.
        </p>

        <button
          type="button"
          disabled={swap === null || hits.length > 0}
          onClick={() => swap && onPick(swap)}
          className={`inline-flex h-12 w-full items-center justify-center rounded-full bg-green px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`}
        >
          Swap for {who}
        </button>
        <button type="button" onClick={onClose} className={`${pillButton} h-12 w-full`}>
          Back
        </button>
      </div>
    </Sheet>
  );
}
