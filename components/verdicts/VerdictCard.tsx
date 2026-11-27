"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MealThumb } from "@/components/MealThumb";
import { VerdictSheet } from "@/components/verdicts/VerdictSheet";
import type { Ask } from "@/components/verdicts/useDinnerToAsk";
import { saveVerdict, skipVerdict } from "@/lib/db/queries/verdicts";
import type { Database } from "@/lib/db/types";
import type { Person } from "@/lib/domain/types";
import { everyoneLiked, savedLine, summarize, type Verdict, type Vote } from "@/lib/domain/verdicts";
import { focusRing } from "@/lib/ui";

/** How long "Saved." stays before the card lets go. */
const SAVED_MS = 6000;

const ghostButton = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-1 text-[14px] font-semibold ${focusRing}`;
const answerButton = `inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-3xl border border-[#D5DBD5] bg-white px-2 py-1 text-center text-[14px] font-semibold leading-tight text-ink disabled:opacity-55 ${focusRing}`;

type Phase = "asking" | "saved" | "gone";

/** "How was Wednesday's dinner?" on the week: one tap for everyone, or person by person, or skip. */
export function VerdictCard({
  ask,
  dayName,
  people,
  offline,
  onDone,
  onHold,
  sb,
  householdId,
}: {
  ask: Ask;
  dayName: string;
  people: Person[];
  offline: boolean;
  /** The card is finished (Saved ran its course, or it was skipped): the week can ask about the next dinner. */
  onDone: () => void;
  /**
   * Called with the ask once it is answered (so the screen keeps this card up while "Saved." shows,
   * though the dinner no longer needs asking), and with null if that save fails.
   */
  onHold?: (held: Ask | null) => void;
  sb: SupabaseClient<Database>;
  householdId: string;
}) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [saved, setSaved] = useState<Verdict | null>(null);
  const [sheet, setSheet] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLElement>(null);
  const { dinner, meal, photo } = ask;

  const finish = () => {
    setPhase("gone");
    onHold?.(null);
    onDone();
  };
  // Held in a ref so the timer below is not restarted by a new `finish` on every render.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // "Saved." goes after 6 seconds, or at the next tap anywhere else. The sheet (Change) pauses it.
  useEffect(() => {
    if (phase !== "saved" || sheet) return;
    const timer = setTimeout(() => finishRef.current(), SAVED_MS);
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) finishRef.current();
    };
    document.addEventListener("pointerdown", away);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", away);
    };
  }, [phase, sheet]);

  const verdictOf = (votes: Record<string, Vote>): Verdict => ({
    mealId: dinner.mealId,
    eatenOn: dinner.date,
    status: "answered",
    votes,
  });

  /** Shows "Saved." at once, and puts the question back if the save does not go through. */
  async function answer(votes: Record<string, Vote>) {
    const before = saved;
    setFailed(false);
    setSaved(verdictOf(votes));
    setPhase("saved");
    onHold?.(ask);
    try {
      await saveVerdict(sb, householdId, dinner, votes);
    } catch (e) {
      setSaved(before);
      setPhase("asking");
      setFailed(true);
      onHold?.(null);
      throw e;
    }
  }

  async function skip() {
    setFailed(false);
    setPhase("gone");
    try {
      await skipVerdict(sb, householdId, dinner);
      onDone();
    } catch {
      setPhase("asking");
      setFailed(true);
    }
  }

  if (phase === "gone") return null;

  // The sheet sits beside the card, not inside it, so it stays open as the card turns into "Saved."
  const sheetView = sheet && (
    <VerdictSheet
      mealName={meal.name}
      people={people}
      initial={saved?.votes ?? everyoneLiked(people)}
      onSave={answer}
      onClose={() => setSheet(false)}
    />
  );

  if (phase === "saved" && saved) {
    // Nobody tried it: there are no words to say, so only "Saved."
    const line = summarize(saved).tried > 0 ? savedLine(saved, meal.name) : "";
    return (
      <>
        <section
          ref={box}
          data-testid="verdict-saved"
          aria-label="Saved"
          role="status"
          className="mx-5 mt-3.5 flex items-center gap-2.5 rounded-2xl border border-line bg-white py-1 pl-3.5 pr-1.5"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F7A4D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Saved.</span> {line}
          </p>
          <button type="button" onClick={() => setSheet(true)} className={`${ghostButton} px-2 text-green`}>
            Change
          </button>
        </section>
        {sheetView}
      </>
    );
  }

  return (
    <>
      <section
        ref={box}
        data-testid="verdict-card"
        aria-label="How was dinner"
        className="mx-5 mt-3.5 rounded-2xl border border-line bg-white px-3.5 pb-3.5 pt-3"
      >
        <div className="flex items-start gap-3">
          <MealThumb src={photo} className="size-12 rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">How was {dayName}’s dinner?</p>
            <p className="mt-px text-[15px] font-semibold">{meal.name}</p>
          </div>
          <button type="button" onClick={() => void skip()} className={`${ghostButton} text-[#4A544F]`}>
            Skip
          </button>
        </div>
        {failed && (
          <p role="alert" className="mt-2 text-[13px] font-medium text-[#A6261B]">
            That didn’t save. Try again.
          </p>
        )}
        <div className="mt-2.5 flex gap-2">
          <button type="button" disabled={offline} onClick={() => void answer(everyoneLiked(people)).catch(() => {})} className={answerButton}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={offline ? "#5B6560" : "#1F7A4D"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <path d="M7 10v10H4.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H7zm0 0l3.6-7.2a2.3 2.3 0 0 1 2.9 2.6L13 9h5.4a2 2 0 0 1 2 2.4l-1.3 7a2 2 0 0 1-2 1.6H7" />
            </svg>
            Everyone liked it
          </button>
          <button type="button" disabled={offline} onClick={() => setSheet(true)} className={answerButton}>
            Not everyone
          </button>
        </div>
        {offline && <p className="mt-2 text-[13px] text-muted">You’re offline. This will keep until you’re back.</p>}
      </section>
      {sheetView}
    </>
  );
}
