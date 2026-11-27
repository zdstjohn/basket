"use client";

import { useState } from "react";
import { IngredientSwapSheet } from "@/components/flags/IngredientSwapSheet";
import { eatersLeft, ideaNote } from "@/components/flags/swap-notes";
import { flagCopy, namesLabel, type Flag } from "@/lib/domain/flags";
import type { Meal, Person, PersonChange, SwapIdea } from "@/lib/domain/types";
import { focusRing, pillButton } from "@/lib/ui";
import { withChange, withoutChange } from "@/lib/db/queries/meals";

export { ideaNote };
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const hasChangeFor = (changes: PersonChange[], p: Person, food: string): boolean =>
  changes.some((c) => c.personId === p.id && c.food === food);

/** 'done' once every flagged person has a change for this food. ('kept' is only ever a choice made on screen, for one visit.) */
export function boxState(flag: Flag, changes: PersonChange[]): "ask" | "done" | "kept" {
  return flag.people.length > 0 && flag.people.every((p) => hasChangeFor(changes, p, flag.food)) ? "done" : "ask";
}

/** "Daughter (4): no mushrooms" / "Mushrooms cut to 4 people". `eaters` is how many people still eat it. */
export function doneCopy(flag: Flag, changes: PersonChange[], people: Person[], eaters: number): { head: string; sub: string } {
  const mine = changes.filter((c) => c.food === flag.food && flag.people.some((p) => p.id === c.personId));
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
  className = "mx-5 mt-3",
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

  const leaveOut = () =>
    apply(flag.people.reduce((all, p) => withChange(all, { personId: p.id, food: flag.food, action: "leave_out" }), changes));
  const pickSwap = (swap: SwapIdea) => {
    setSwapping(false);
    return apply(flag.people.reduce((all, p) => withChange(all, { personId: p.id, food: flag.food, action: "swap", swap }), changes));
  };
  const undo = () => apply(flag.people.reduce((all, p) => withoutChange(all, p.id, flag.food), changes));

  if (state === "done") {
    const done = doneCopy(flag, changes, people, eatersLeft(flag, meal, people));
    return (
      <section aria-label="Won’t eat" data-testid="dislike-box" data-state="done" className={`${className} flex items-center gap-3 rounded-[14px] bg-green-tint px-3.5 py-3`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F7A4D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-[#134D31]">{done.head}</p>
          <p className="mt-0.5 break-words text-xs text-[#2C5A42]">{done.sub}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void undo()} className={`${pillButton} shrink-0`}>
          Change
        </button>
      </section>
    );
  }

  const them = copy.pronoun;
  return (
    <>
      <section aria-label="Won’t eat" data-testid="dislike-box" data-state="ask" className={`${className} rounded-[14px] bg-[#EEF0ED] px-3.5 py-3`}>
        <p className="break-words text-[15px] font-semibold text-ink">{copy.head}</p>
        <p className="mt-[3px] break-words text-sm text-[#4A544F]">{copy.body}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void leaveOut()} className={`${pillButton} border-transparent bg-white`}>
            Leave {them} out
          </button>
          <button type="button" disabled={busy} onClick={() => setSwapping(true)} className={`${pillButton} border-transparent bg-white`}>
            Swap {them}
          </button>
        </div>
        <button type="button" onClick={() => setKept(true)} className={`mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-[#4A544F] underline ${focusRing}`}>
          Keep it as is
        </button>
      </section>
      {swapping && (
        <IngredientSwapSheet flag={flag} people={people} mealName={mealName} meal={meal} onPick={(s) => void pickSwap(s)} onClose={() => setSwapping(false)} />
      )}
    </>
  );
}
