"use client";

import { useState } from "react";
import { MealThumb } from "@/components/MealThumb";
import { Sheet } from "@/components/Sheet";
import { CookDoubleRow } from "@/components/leftovers/CookDoubleRow";
import { leftoverFailure } from "@/components/leftovers/errors";
import { NightPicker } from "@/components/leftovers/NightPicker";
import { useOnline } from "@/components/leftovers/useOnline";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setMealPhoto, toMeal, updateMeal } from "@/lib/db/queries/meals";
import { cookDouble, setWeekMeal, usualAmount } from "@/lib/db/queries/weeks";
import type { MealRow, WeekMeal } from "@/lib/db/rows";
import type { Database } from "@/lib/db/types";
import { cookState, defaultChoice, doubleServings, nightChoices } from "@/lib/domain/leftovers";
import { householdServings } from "@/lib/domain/portions";
import type { Person } from "@/lib/domain/types";
import type { Day } from "@/lib/domain/weeks";
import { resizeForUpload, uploadMealPhoto } from "@/lib/photos/upload";
import { focusRing, pillButton } from "@/lib/ui";
import { dayName } from "@/lib/week/format";
import { swapDoubleLine, takeOffNote } from "@/lib/week/leftover-copy";
import { dayNote } from "@/lib/week/note";

/** A planned dinner opened from the week: photo, link to the recipe, leftovers, favorite, take it off. */
export function MealSheet({
  sb,
  householdId,
  meal,
  weekMeal,
  day,
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
  householdId: string;
  meal: MealRow;
  weekMeal: WeekMeal;
  day: Day;
  photo: string | null;
  people: Person[];
  nights: WeekMeal[];
  mealNames: Record<string, string>;
  weekDays: Day[];
  busyDays: Day[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = householdServings(people);
  const override = weekMeal.servings_override === null ? null : Number(weekMeal.servings_override);
  const online = useOnline();
  const [view, setView] = useState<"main" | "pick">("main");
  const state = cookState(weekMeal, nights, base);
  const leftoverNight = state.kind === "double" ? state.night : null;
  const credit = !meal.photo_path && meal.photo_url ? meal.photo_credit : null;

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const changePhoto = (file: File | undefined) =>
    file &&
    run(async () => {
      const blob = await resizeForUpload(file);
      const path = await uploadMealPhoto(sb, householdId, meal.id, blob);
      await setMealPhoto(sb, meal.id, { path });
    }, "We couldn't save that photo. Try again.");

  const choices = nightChoices({ cookDay: day, slot: weekMeal.slot, weekDays, rows: nights, busy: busyDays, cookId: weekMeal.id });
  const takenNames: Record<string, string> = {};
  for (const c of choices) if (c.taken === "dinner" && c.takenMealId) takenNames[c.day] = mealNames[c.takenMealId] ?? "A dinner";

  /** Runs a leftovers change from the picker; on success the sheet goes back to the main view (the green box is the confirmation). */
  async function changeLeftovers(action: () => Promise<void>, picked: Day | null) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      setView("main");
    } catch (e) {
      setError(leftoverFailure(e, picked, "We couldn't change that. Try again."));
      // The other phone may have changed the week: rebuild the choices from fresh rows.
      await onChanged().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (view === "pick") {
    return (
      <Sheet label={meal.name} onClose={onClose}>
        <NightPicker
          mode="cook"
          mealName={meal.name}
          cookDay={day}
          choices={choices}
          takenNames={takenNames}
          swapLine={swapDoubleLine(toMeal(meal), people)}
          initial={defaultChoice(choices)}
          busy={busy}
          error={error}
          showUsual={state.kind !== "usual"}
          onConfirm={(picked) => void changeLeftovers(() => cookDouble(sb, weekMeal, doubleServings(base), picked), picked)}
          onUsual={() => void changeLeftovers(() => usualAmount(sb, weekMeal), null)}
          onBack={() => {
            setError(null);
            setView("main");
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet label={meal.name} onClose={onClose}>
      <div className="flex flex-col gap-3 p-5 pb-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[22px] font-bold leading-tight">{meal.name}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full ${focusRing}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <MealThumb src={photo} className="h-40 w-full rounded-2xl" tileText="text-sm" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{credit ? `Photo: ${credit}` : ""}</p>
          <label className={`${pillButton} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green`}>
            Change photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Change photo"
              disabled={busy}
              onChange={(e) => {
                void changePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <p className="text-sm text-muted">{dayNote(toMeal(meal), people, override, state.kind === "double")}</p>
        {meal.source_url && (
          <a
            href={meal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-green ${focusRing}`}
          >
            Open the full recipe
          </a>
        )}

        <CookDoubleRow state={state} disabled={busy} offline={!online} onOpen={() => setView("pick")} />

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => void (await updateMeal(sb, meal.id, { is_favorite: !meal.is_favorite })), "We couldn't change that. Try again.")
          }
          className={`${pillButton} w-full`}
        >
          {meal.is_favorite ? "Remove from favorites" : "Save as a favorite"}
        </button>
        <div className="flex flex-col gap-1.5">
          {takeOffNote(leftoverNight) && <p className="text-[13px] text-[#4A544F]">{takeOffNote(leftoverNight)}</p>}
          <button
            type="button"
            disabled={busy || !online}
            onClick={() =>
              void run(async () => {
                await setWeekMeal(sb, weekMeal.week_id, day, weekMeal.slot, null);
                onClose();
              }, "We couldn't take that off. Try again.")
            }
            className={`${pillButton} w-full text-[#A6261B]`}
          >
            Take off {dayName(day)}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-[#A6261B]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
