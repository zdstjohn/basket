"use client";

import { useState } from "react";
import { allergyHits, eatersLeft, ideaNote, inWords } from "@/components/flags/swap-notes";
import { Sheet } from "@/components/Sheet";
import { cleanFood, swapIdeas } from "@/lib/domain/families";
import { AllergyBox } from "@/components/flags/AllergyBox";
import { flagCopy, namesLabel, type Flag } from "@/lib/domain/flags";
import type { Meal, Person, SwapIdea } from "@/lib/domain/types";
import { Button } from "@/components/ui/Button";
import { RadioRows } from "@/components/ui/RadioRows";
import { TextField } from "@/components/ui/Field";

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
    <Sheet label={`Instead of ${flag.food}`} title={`Instead of ${flag.food}`} onClose={onClose}>
      <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
        <p className="text-small text-ink-soft">
          For {who}, in {mealName}.
        </p>

        {ideas.length > 0 && (
          <RadioRows
            label={`Instead of ${flag.food}`}
            name="swap-idea"
            options={ideas.map((idea, i) => ({ value: String(i), label: capital(idea.canonical), detail: ideaNote(idea, meal) }))}
            value={chosen === null ? "" : String(chosen)}
            onChange={(v) => {
              setChosen(Number(v));
              setTyped("");
            }}
          />
        )}

        <TextField
          label="Or something else"
          value={typed}
          placeholder="Type a food"
          maxLength={40}
          onChange={(e) => {
            setTyped(e.target.value);
            if (e.target.value.trim()) setChosen(null);
          }}
        />

        {hits.length > 0 && <AllergyBox flags={hits} people={people} className="" />}

        <p className="text-small text-ink-soft">
          {dropNote(flag.food, plural, eatersLeft(flag, meal, people))} We’ll remember this for next time you make it.
        </p>

        <Button variant="main" disabled={swap === null || hits.length > 0} onClick={() => swap && onPick(swap)}>
          Swap for {who}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Back
        </Button>
      </div>
    </Sheet>
  );
}
