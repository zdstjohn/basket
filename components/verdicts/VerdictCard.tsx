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
import { Check, ChevronRight, ThumbsUp } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ErrorBanner } from "@/components/ui/states";
import { quietLink } from "@/lib/ui";

/** How long "Saved." stays before the card lets go. */
const SAVED_MS = 6000;

const ANSWER = "min-w-0 flex-1 disabled:opacity-60";

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
          className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-surface p-3"
        >
          <Icon icon={Check} size={18} />
          <p className="min-w-0 flex-1 text-body">
            <span className="font-semibold">Saved.</span> {line}
          </p>
          <button type="button" onClick={() => setSheet(true)} className={`${quietLink} min-w-11 justify-center`}>
            Change
            <Icon icon={ChevronRight} size={18} />
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
        className="mx-4 mt-3 flex flex-col gap-3 rounded-md bg-surface p-3"
      >
        <div className="flex items-start gap-3">
          <MealThumb src={photo} className="size-12 rounded-sm" />
          <div className="min-w-0 flex-1">
            <p className="text-body text-ink">How was {dayName}’s dinner?</p>
            <p className="text-body font-semibold text-ink">{meal.name}</p>
          </div>
          <button type="button" onClick={() => void skip()} className={`${quietLink} min-w-11 justify-center`}>
            Skip
            <Icon icon={ChevronRight} size={18} />
          </button>
        </div>
        {failed && <ErrorBanner message="That didn’t save. Try again." />}
        <div className="flex gap-2">
          <Button variant="ghost" disabled={offline} onClick={() => void answer(everyoneLiked(people)).catch(() => {})} className={ANSWER}>
            <Icon icon={ThumbsUp} size={18} />
            Everyone liked it
          </Button>
          <Button variant="ghost" disabled={offline} onClick={() => setSheet(true)} className={ANSWER}>
            Not everyone
          </Button>
        </div>
        {offline && <Banner>You’re offline. This will keep until you’re back.</Banner>}
      </section>
      {sheetView}
    </>
  );
}
