"use client";

import { useState } from "react";
import { MealThumb } from "@/components/MealThumb";
import { Sheet } from "@/components/Sheet";
import { leftoverFailure } from "@/components/leftovers/errors";
import { NightPicker } from "@/components/leftovers/NightPicker";
import { useOnline } from "@/components/leftovers/useOnline";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toMeal } from "@/lib/db/queries/meals";
import { cookDouble, moveLeftover, removeLeftover } from "@/lib/db/queries/weeks";
import type { MealRow, WeekMeal } from "@/lib/db/rows";
import type { Database } from "@/lib/db/types";
import { defaultChoice, doubleServings, nightChoices } from "@/lib/domain/leftovers";
import { householdServings } from "@/lib/domain/portions";
import type { Person } from "@/lib/domain/types";
import type { Day } from "@/lib/domain/weeks";
import { focusRing, pillButton } from "@/lib/ui";
import { dayName } from "@/lib/week/format";
import { leftoverSheetCopy, OFFLINE_LINE, swapDoubleLine } from "@/lib/week/leftover-copy";

const FAILURE = "We couldn't change that. Try again.";

/** A leftovers night opened from the week: where it comes from, move it, take it off. */
export function LeftoverSheet({
  sb,
  leftover,
  cook,
  meal,
  photo,
  people,
  nights,
  mealNames,
  weekDays,
  busyDays,
  onClose,
  onChanged,
}: {
  sb: SupabaseClient<Database>;
  leftover: WeekMeal;
  cook: WeekMeal | null;
  meal: MealRow;
  photo: string | null;
  people: Person[];
  nights: WeekMeal[];
  mealNames: Record<string, string>;
  weekDays: Day[];
  busyDays: Day[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const online = useOnline();
  const [view, setView] = useState<"main" | "pick">("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = leftover.day as Day;
  const swapLine = swapDoubleLine(toMeal(meal), people);
  const daysBefore = cook ? weekDays.indexOf(day) - weekDays.indexOf(cook.day as Day) : 0;
  const copy = cook ? leftoverSheetCopy(meal.name, day, cook.day as Day, daysBefore, swapLine) : null;

  async function run(action: () => Promise<void>, picked: Day | null) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      onClose();
    } catch (e) {
      setError(leftoverFailure(e, picked, FAILURE));
      // Rebuild the choices from what the other phone has now.
      await onChanged().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const choices = cook
    ? nightChoices({ cookDay: cook.day as Day, slot: leftover.slot, weekDays, rows: nights, busy: busyDays, cookId: cook.id })
    : [];
  const takenNames: Record<string, string> = {};
  for (const c of choices) if (c.taken === "dinner" && c.takenMealId) takenNames[c.day] = mealNames[c.takenMealId] ?? "A dinner";

  const close = (
    <button type="button" aria-label="Close" onClick={onClose} className={`-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full ${focusRing}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );

  return (
    <Sheet label="Leftovers" onClose={onClose}>
      {view === "pick" && cook ? (
        <NightPicker
          mode="move"
          mealName={meal.name}
          cookDay={cook.day as Day}
          choices={choices}
          takenNames={takenNames}
          swapLine={swapLine}
          initial={defaultChoice(choices)}
          busy={busy}
          error={error}
          showUsual={false}
          onConfirm={(picked) =>
            void run(
              () =>
                picked === null
                  ? cookDouble(sb, cook, Number(cook.servings_override ?? doubleServings(householdServings(people))), null)
                  : picked === day
                    ? Promise.resolve()
                    : moveLeftover(sb, leftover.id, picked),
              picked,
            )
          }
          onUsual={() => undefined}
          onBack={() => {
            setError(null);
            setView("main");
          }}
        />
      ) : (
        <div className="flex flex-col gap-3 p-5 pb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-bold leading-tight">Leftovers</h2>
              <p className="mt-1 text-sm text-muted">{dayName(day)} dinner</p>
            </div>
            {close}
          </div>
          <div className="flex items-center gap-3 rounded-[14px] border border-line p-2.5">
            <MealThumb src={photo} className="size-14 rounded-[10px]" tileText="text-xs" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{meal.name}</p>
              {copy && <p className="mt-0.5 text-[13px] text-muted">{copy.when}</p>}
            </div>
          </div>
          <p className="text-sm">{copy ? copy.nothing : `Nothing to buy for ${dayName(day)}.`}</p>
          {cook && (
            <button type="button" disabled={busy || !online} onClick={() => setView("pick")} className={`${pillButton} w-full`}>
              Move to another night
            </button>
          )}
          {copy && <p className="-mb-1.5 text-[13px] text-[#4A544F]">{copy.undo}</p>}
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => void run(() => removeLeftover(sb, leftover), null)}
            className={`${pillButton} w-full text-[#A6261B]`}
          >
            Take off {dayName(day)}
          </button>
          {!online && <p className="text-[13px] text-[#4A544F]">{OFFLINE_LINE}</p>}
          {error && (
            <p role="alert" className="text-sm font-medium text-[#A6261B]">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
