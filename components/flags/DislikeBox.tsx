"use client";

import { useState } from "react";
import { IngredientSwapSheet } from "@/components/flags/IngredientSwapSheet";
import { matchFood } from "@/lib/domain/families";
import { eatersLeft, ideaNote } from "@/components/flags/swap-notes";
import { flagCopy, namesLabel, type Flag } from "@/lib/domain/flags";
import type { Meal, Person, PersonChange, SwapIdea } from "@/lib/domain/types";
import { ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { quietLink } from "@/lib/ui";
import { withChange } from "@/lib/db/queries/meals";

export { ideaNote };
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// The same matcher the list math uses, so "mushroom" and "mushrooms" are one food.
const isFood = (c: PersonChange, food: string): boolean => matchFood(c.food, food) !== null;
const hasChangeFor = (changes: PersonChange[], p: Person, food: string): boolean =>
  changes.some((c) => c.personId === p.id && isFood(c, food));

/** 'done' once every flagged person has a change for this food. ('kept' is only ever a choice made on screen, for one visit.) */
export function boxState(flag: Flag, changes: PersonChange[]): "ask" | "done" | "kept" {
  return flag.people.length > 0 && flag.people.every((p) => hasChangeFor(changes, p, flag.food)) ? "done" : "ask";
}

/** "Daughter (4): no mushrooms" / "Mushrooms cut to 4 people". `eaters` is how many people still eat it. */
export function doneCopy(flag: Flag, changes: PersonChange[], people: Person[], eaters: number): { head: string; sub: string } {
  const mine = changes.filter((c) => isFood(c, flag.food) && flag.people.some((p) => p.id === c.personId));
  const who = namesLabel(flag.people.filter((p) => hasChangeFor(mine, p, flag.food)), people);
  const swap = mine.find((c) => c.action === "swap" && c.swap)?.swap;
  return {
    head: swap ? `${who}: ${swap.canonical} instead of ${flag.food}` : `${who}: no ${flag.food}`,
    sub: `${capital(flag.food)} cut to ${eaters} people`,
  };
}

/** The grey "won't eat" box on a draft or a planned dinner, and its green done state. An allergy never gets one. */
export function DislikeBox({
  flag,
  people,
  amount,
  changes,
  onChange,
  mealName,
  meal,
  className = "mx-4 mt-3",
}: {
  flag: Flag;
  people: Person[];
  amount: string;
  changes: PersonChange[];
  onChange: (next: PersonChange[]) => void | Promise<void>;
  mealName: string;
  meal: Meal;
  className?: string;
}) {
  const [kept, setKept] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [busy, setBusy] = useState(false);
  if (flag.kind !== "dislike") return null;

  const state = boxState(flag, changes);
  if (state === "ask" && kept) return null;
  const copy = flagCopy(flag, people, amount);

  async function apply(next: PersonChange[]) {
    setBusy(true);
    try {
      await onChange(next);
    } catch {
      // The screen that owns the choices shows its own error.
    } finally {
      setBusy(false);
    }
  }

  // Start from a list without these people's earlier changes for this food, however it was spelled.
  const cleared = changes.filter((c) => !(flag.people.some((p) => p.id === c.personId) && isFood(c, flag.food)));
  const leaveOut = () =>
    apply(flag.people.reduce((all, p) => withChange(all, { personId: p.id, food: flag.food, action: "leave_out" }), cleared));
  const pickSwap = (swap: SwapIdea) => {
    setSwapping(false);
    return apply(flag.people.reduce((all, p) => withChange(all, { personId: p.id, food: flag.food, action: "swap", swap }), cleared));
  };
  const undo = () => apply(cleared);

  if (state === "done") {
    const done = doneCopy(flag, changes, people, eatersLeft(flag, meal, people));
    return (
      <section aria-label="Won’t eat" data-testid="dislike-box" data-state="done" className={`${className} flex items-center gap-3 rounded-md bg-surface p-3`}>
        <Icon icon={Check} size={18} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-small font-bold text-ink">{done.head}</p>
          <p className="mt-0.5 break-words text-label text-ink-soft">{done.sub}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void undo()} className={`${quietLink} min-w-11 shrink-0 justify-center`}>
          Change
          <Icon icon={ChevronRight} size={18} />
        </button>
      </section>
    );
  }

  const them = copy.pronoun;
  return (
    <>
      <section aria-label="Won’t eat" data-testid="dislike-box" data-state="ask" className={`${className} rounded-md bg-sunk p-3`}>
        <p className="break-words text-small font-bold text-ink">{copy.head}</p>
        <p className="mt-1 break-words text-small text-ink-soft">{copy.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => void leaveOut()}>
            Leave {them} out
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setSwapping(true)}>
            Swap {them}
          </Button>
        </div>
        <button type="button" onClick={() => setKept(true)} className={`${quietLink} mt-1 min-w-11`}>
          Keep it as is
          <Icon icon={ChevronRight} size={18} />
        </button>
      </section>
      {swapping && (
        <IngredientSwapSheet flag={flag} people={people} mealName={mealName} meal={meal} onPick={(s) => void pickSwap(s)} onClose={() => setSwapping(false)} />
      )}
    </>
  );
}
